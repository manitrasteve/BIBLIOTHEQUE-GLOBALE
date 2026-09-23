<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\IngestDocumentJob;
use App\Jobs\NotifyDocumentPublishedJob;
use App\Models\Category;
use App\Models\Consultation;
use App\Models\Document;
use App\Services\ActivityLogService;
use App\Services\StaffNotifier;
use App\Support\QueueKicker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentController extends Controller
{
    // Type et langue sont désormais saisis librement ; les filtres du catalogue envoient encore les
    // anciens codes : on accepte le code OU son libellé pour retrouver aussi les documents saisis en texte.
    private const TYPE_LABELS = ['livre' => 'Livre', 'memoire' => 'Mémoire', 'these' => 'Thèse', 'rapport' => 'Rapport', 'autre' => 'Autre'];
    private const LANGUAGE_LABELS = ['fr' => 'Français', 'mg' => 'Malgache', 'en' => 'Anglais', 'es' => 'Espagnol', 'pt' => 'Portugais', 'it' => 'Italien', 'ru' => 'Russe', 'autre' => 'Autre'];

    private function withLabel(string $value, array $labels): array
    {
        return array_values(array_unique(array_filter([$value, $labels[mb_strtolower($value)] ?? null])));
    }

    // Catégorie saisie librement : retrouve la catégorie existante (nom sans casse, ou même slug) ou la crée.
    private function resolveCategoryId(string $name): int
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name));

        $category = Category::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->orWhere('slug', Str::slug($name))
            ->first();

        return ($category ?? Category::create(['name' => $name]))->id;
    }

    // Recherche publique : titre, auteur, catégorie, année, bibliothèque, mot-clé.
    // Accessible sans connexion, mais ne renvoie que les métadonnées.
    public function index(Request $request)
    {
        $query = Document::query()
            ->with(['authors:id,name', 'category:id,name', 'library:id,name'])
            ->withCount(['consultations','favorites','aiQueries'])
            ->where('status', 'publie');

        if ($search = $request->get('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('keywords', 'like', "%{$search}%")
                  ->orWhereHas('authors', fn ($a) => $a->where('name', 'like', "%{$search}%"));
            });
        }

        // Filtre optionnel par auteur (Espace recherche du chercheur).
        if ($author = $request->get('author')) {
            $query->whereHas('authors', fn ($a) => $a->where('name', 'like', "%{$author}%"));
        }

        if ($category = $request->get('category_id')) {
            $query->where('category_id', $category);
        }
        if ($library = $request->get('library_id')) {
            $query->where('library_id', $library);
        }
        if ($year = $request->get('year')) {
            $query->where('year', $year);
        }
        if ($type = $request->get('type')) {
            $query->whereIn('type', $this->withLabel($type, self::TYPE_LABELS));
        }
        if ($language = $request->get('language')) {
            $query->whereIn('language', $this->withLabel($language, self::LANGUAGE_LABELS));
        }

        $documents = $query->orderByDesc('published_at')->paginate(15);

        // Champs publics uniquement : jamais file_path exposé directement.
        $documents->getCollection()->transform(fn (Document $d) => [
            'uuid' => $d->uuid,
            'slug' => $d->slug,
            'title' => $d->title,
            'subtitle' => $d->subtitle,
            'abstract' => $d->abstract,
            'type' => $d->type,
            'niveau' => $d->niveau,
            'year' => $d->year,
            'language' => $d->language,
            'cover_url' => $d->cover_path ? Storage::url($d->cover_path) : null,
            'authors' => $d->authors->pluck('name'),
            'category' => $d->category?->name,
            'library' => $d->library?->name,
            'access_level' => $d->access_level,
            'consultation_count' => $d->consultations_count,
            'favorite_count' => $d->favorites_count,
            'ai_query_count' => $d->ai_queries_count,
        ]);

        return response()->json($documents);
    }

    // Fiche détaillée : publique en métadonnées, mais sans contenu protégé.
    public function show(Request $request, string $slug)
    {
        $document = Document::with(['authors', 'category', 'library'])->withCount(['consultations','favorites','aiQueries'])
            ->where('slug', $slug)
            ->where('status', 'publie')
            ->firstOrFail();

        $canView = $request->user() && $this->userCanAccess($request->user(), $document);

        return response()->json([
            'uuid' => $document->uuid,
            'slug' => $document->slug,
            'title' => $document->title,
            'subtitle' => $document->subtitle,
            'abstract' => $document->abstract,
            'type' => $document->type,
            'niveau' => $document->niveau,
            'year' => $document->year,
            'publisher' => $document->publisher,
            'isbn' => $document->isbn,
            'language' => $document->language,
            'edition' => $document->edition,
            'keywords' => $document->keywords,
            'cover_url' => $document->cover_path ? Storage::url($document->cover_path) : null,
            'authors' => $document->authors->pluck('name'),
            'category' => $document->category?->name,
            'library' => $document->library?->name,
            'access_level' => $document->access_level,
            'can_view_content' => $canView,
            'favorite_count' => $document->favorites_count,
            'consultation_count' => $document->consultations_count,
            'ai_query_count' => $document->ai_queries_count,
            'is_favorited' => $request->user() ? $document->favorites()->where('user_id',$request->user()->id)->exists() : false,
        ]);
    }

    // Lecteur intégré : consultation sécurisée du PDF, jamais de téléchargement direct.
    // Utilisateur connecté + compte actif + droits suffisants requis.
    public function stream(Request $request, string $slug): StreamedResponse
    {
        $document = Document::where('slug', $slug)->where('status', 'publie')->firstOrFail();
        $user = $request->user();

        abort_unless($user, 401, 'Connexion requise.');
        abort_unless($user->is_active, 403, 'Compte non actif.');
        abort_unless($this->userCanAccess($user, $document), 403, 'Droits insuffisants pour ce document.');
        abort_unless(Storage::disk('local')->exists($document->file_path), 404, 'Fichier introuvable.');

        Consultation::create(['user_id' => $user->id, 'document_id' => $document->id]);
        ActivityLogService::log($user->id, 'consultation_document', $document->title, $document);

        // Le fichier est streamé inline, jamais renvoyé avec Content-Disposition: attachment,
        // pour empêcher le téléchargement depuis le lecteur intégré.
        $response = Storage::disk('local')->response($document->file_path, null, [
            'Content-Disposition' => 'inline',
            'Content-Type' => 'application/pdf',
            'Cache-Control' => 'private, no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'SAMEORIGIN',
            'Referrer-Policy' => 'same-origin',
        ]);

        return $response;
    }

    // Liste de gestion (bibliothécaire/admin) : tous statuts, tous champs.
    public function manageIndex(Request $request)
    {
        $query = Document::with(['authors:id,name', 'category:id,name', 'library:id,name']);

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }
        if ($search = $request->get('q')) {
            $query->where('title', 'like', "%{$search}%");
        }
        // Bibliothèque Numérique Globale : administrateur et bibliothécaire peuvent filtrer sur une bibliothèque précise.
        $request->user()->restrictToManagedLibrary($query);
        if (($request->user()->isAdmin() || $request->user()->isLibrarian()) && $library = $request->get('library_id')) {
            $query->where('library_id', $library);
        }

        $documents = $query->orderByDesc('created_at')->paginate(20);

        // Totaux réels (COUNT / GROUP BY SQL) : mêmes filtres de recherche et de bibliothèque que la liste,
        // mais sans le statut sélectionné, pour que chaque bouton affiche son propre nombre.
        return response()->json([
            ...$documents->toArray(),
            'counts' => $this->manageCounts($request),
        ]);
    }

    private function manageCounts(Request $request): array
    {
        $user = $request->user();
        $base = fn () => $user->restrictToManagedLibrary(Document::query())
            ->when($request->get('q'), fn ($q, $search) => $q->where('title', 'like', "%{$search}%"))
            ->when(($user->isAdmin() || $user->isLibrarian()) ? $request->get('library_id') : null, fn ($q, $library) => $q->where('library_id', $library));

        $byStatus = $base()->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        // Le type est saisi librement (« livre », « Livre », « Mémoire », « memoire »…) : on fusionne les variantes.
        $byType = [];
        foreach ($base()->selectRaw('type, COUNT(*) as total')->groupBy('type')->get() as $row) {
            $key = Str::of(Str::ascii(mb_strtolower(trim((string) $row->type))))->toString();
            $raw = trim((string) $row->type);
            $label = self::TYPE_LABELS[$key] ?? ($key === '' ? 'Non renseigné' : mb_strtoupper(mb_substr($raw, 0, 1)) . mb_substr($raw, 1));
            $byType[$key]['type'] = $byType[$key]['type'] ?? $label;
            $byType[$key]['count'] = ($byType[$key]['count'] ?? 0) + (int) $row->total;
        }
        // Plus nombreux d'abord ; à égalité, ordre alphabétique (résultat stable).
        $byType = collect($byType)->sort(fn ($a, $b) => [$b['count'], mb_strtolower($a['type'])] <=> [$a['count'], mb_strtolower($b['type'])])->values()->all();

        return [
            'all' => (int) $byStatus->sum(),
            'brouillon' => (int) ($byStatus['brouillon'] ?? 0),
            'publie' => (int) ($byStatus['publie'] ?? 0),
            'archive' => (int) ($byStatus['archive'] ?? 0),
            'by_type' => $byType,
        ];
    }

    // Fiche complète pour l'écran d'édition (tous statuts, tous champs).
    public function manageShow(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        return response()->json($document->load(['authors:id,name', 'category:id,name', 'library:id,name']));
    }

    // Un bibliothécaire ne gère que les documents de sa bibliothèque (l'administrateur : toutes).
    private function authorizeLibrary(Request $request, ?int $libraryId): void
    {
        abort_unless($request->user()->managesLibrary($libraryId), 403, 'Ce document appartient à une autre bibliothèque.');
    }

    // Bibliothécaire / Admin : création d'un document (statut brouillon par défaut)
    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'abstract' => ['nullable', 'string'],
            'type' => ['required', 'string', 'max:100'],
            'niveau' => ['nullable', 'string', 'max:100'],
            // Catégorie : nom saisi librement (créée si elle n'existe pas) ; category_id reste accepté.
            'category' => ['required_without:category_id', 'nullable', 'string', 'max:255', 'regex:/[\pL\pN]/u'],
            'category_id' => ['required_without:category', 'nullable', 'exists:categories,id'],
            'library_id' => ['required', 'exists:libraries,id'],
            'year' => ['nullable', 'digits:4'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'isbn' => ['nullable', 'string', 'max:50'],
            'language' => ['required', 'string', 'max:50'],
            'edition' => ['nullable', 'string', 'max:100'],
            'keywords' => ['nullable', 'string'],
            'access_level' => ['required', 'in:public,authentifie,restreint'],
            'author_ids' => ['array'],
            'author_ids.*' => ['exists:authors,id'],
            'file' => ['required', 'file', 'mimes:pdf', 'max:51200'],
            'cover' => ['nullable', 'image', 'max:5120'],
        ]);

        $this->authorizeLibrary($request, (int) $data['library_id']); // pas de création dans une autre bibliothèque

        if (!empty($data['category'])) {
            $data['category_id'] = $this->resolveCategoryId($data['category']);
        }
        unset($data['category']);

        $filePath = $request->file('file')->store('documents', 'local'); // storage/app/private si disk configuré ainsi
        $coverPath = $request->hasFile('cover')
            ? $request->file('cover')->store('covers', 'public')
            : null;

        $document = Document::create([
            ...$data,
            'file_path' => $filePath,
            'cover_path' => $coverPath,
            'status' => 'brouillon',
            'created_by' => $request->user()->id,
        ]);

        if (!empty($data['author_ids'])) {
            $document->authors()->sync($data['author_ids']);
        }

        ActivityLogService::log($request->user()->id, 'creation_document', $document->title, $document);
        StaffNotifier::documentEvent($request->user(), $document, 'ajoute');

        // Extraction du texte + découpage + embeddings Gemini, pour que le
        // module IA (question-réponse) puisse répondre sur ce document. En
        // tâche de fond : un gros mémoire représente des dizaines d'appels
        // Gemini séquentiels, bien trop long pour faire attendre l'utilisateur
        // sur la création (le document est déjà "brouillon" et utilisable).
        // Un worker de file n'est pas garanti actif en permanence : on en
        // relance un éphémère à chaque dispatch (voir QueueKicker).
        QueueKicker::dispatch(new IngestDocumentJob($document));

        return response()->json($document, 201);
    }

    public function update(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'abstract' => ['nullable', 'string'],
            // Le type était ignoré à la modification ; il est désormais modifiable (texte libre).
            'type' => ['sometimes', 'required', 'string', 'max:100'],
            'niveau' => ['nullable', 'string', 'max:100'],
            'category' => ['sometimes', 'required', 'string', 'max:255', 'regex:/[\pL\pN]/u'],
            'category_id' => ['sometimes', 'exists:categories,id'],
            'library_id' => ['sometimes', 'exists:libraries,id'],
            'year' => ['nullable', 'digits:4'],
            'publisher' => ['nullable','string','max:255'],
            'isbn' => ['nullable','string','max:50'],
            'language' => ['sometimes', 'required', 'string', 'max:50'],
            'edition' => ['nullable','string','max:100'],
            'keywords' => ['nullable','string'],
            'access_level' => ['sometimes', 'in:public,authentifie,restreint'],
            'author_ids' => ['array'],
            'author_ids.*' => ['exists:authors,id'],
            'file' => ['nullable','file','mimes:pdf','max:51200'],
            'cover' => ['nullable','image','max:5120'],
        ]);
        if (isset($data['library_id'])) {
            $this->authorizeLibrary($request, (int) $data['library_id']); // pas de transfert vers une autre bibliothèque
        }
        if ($request->hasFile('file')) { $data['file_path']=$request->file('file')->store('documents','local'); }
        if ($request->hasFile('cover')) { $data['cover_path']=$request->file('cover')->store('covers','public'); }
        if (!empty($data['category'])) {
            $data['category_id'] = $this->resolveCategoryId($data['category']);
        }
        unset($data['file'], $data['cover'], $data['category']);
        $before = $this->auditSnapshot($document);
        $previousLibraryId = $document->library_id;
        $document->update($data);
        // Le formulaire renvoie toujours la liste complète des auteurs cochés ; si elle est
        // vidée, FormData n'envoie aucune entrée "author_ids[]" (la clé est alors absente de
        // la requête). On synchronise donc toujours, avec [] par défaut, pour bien retirer
        // tous les auteurs plutôt que de laisser silencieusement les anciens en place.
        $document->authors()->sync($data['author_ids'] ?? []);

        // Audit : uniquement les champs réellement modifiés, avec leur valeur avant / après.
        $changes = ActivityLogService::diff($before, $this->auditSnapshot($document));
        if ($request->hasFile('file')) $changes['fichier'] = ['before' => null, 'after' => 'PDF remplacé'];
        if ($request->hasFile('cover')) $changes['couverture'] = ['before' => null, 'after' => 'image remplacée'];
        if ($changes) {
            ActivityLogService::log($request->user()->id, 'modification_document', $document->title, $document, $changes);
            // Notification : seulement si quelque chose a réellement changé ; l'ancienne bibliothèque est aussi prévenue si le document a été déplacé.
            StaffNotifier::documentEvent($request->user(), $document, 'modifie', array_keys($changes), [$previousLibraryId]);
        }

        if ($request->hasFile('file')) QueueKicker::dispatch(new IngestDocumentJob($document->fresh()));
        return response()->json($document->fresh()->load('authors'));
    }

    // État lisible d'un document pour le journal d'audit (catégorie, bibliothèque et auteurs en clair).
    private function auditSnapshot(Document $document): array
    {
        $d = Document::with(['category:id,name', 'library:id,name', 'authors:id,name'])->find($document->id);

        return [
            'title' => $d->title,
            'subtitle' => $d->subtitle,
            'abstract' => $d->abstract,
            'type' => $d->type,
            'niveau' => $d->niveau,
            'category' => $d->category?->name,
            'library' => $d->library?->name,
            'year' => $d->year,
            'publisher' => $d->publisher,
            'isbn' => $d->isbn,
            'language' => $d->language,
            'edition' => $d->edition,
            'keywords' => $d->keywords,
            'access_level' => $d->access_level,
            'authors' => $d->authors->pluck('name')->sort()->values()->all() ?: null,
        ];
    }

    // Publication : change le statut et notifie Admin/Bibliothécaire + utilisateurs concernés
    public function publish(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        $previousStatus = $document->status;
        $document->update(['status' => 'publie', 'published_at' => now()]);

        ActivityLogService::log(
            $request->user()->id,
            'publication_document',
            $document->title,
            $document,
            ['status' => ['before' => $previousStatus, 'after' => 'publie']],
        );

        // Notifie tous les utilisateurs actifs en tâche de fond : une base
        // d'utilisateurs nombreuse rendrait sinon le bouton "Publier" très lent.
        QueueKicker::dispatch(new NotifyDocumentPublishedJob($document, $request->user()->id));

        return response()->json($document);
    }

    public function reindex(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        QueueKicker::dispatch(new IngestDocumentJob($document));
        return response()->json(['message' => 'Indexation RAG relancée.']);
    }

    public function archive(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        $previousStatus = $document->status;
        $document->update(['status' => 'archive']);

        ActivityLogService::log(
            $request->user()->id,
            'archivage_document',
            $document->title,
            $document,
            ['status' => ['before' => $previousStatus, 'after' => 'archive']],
        );

        // Pas de notification si le document était déjà archivé (évite les doublons).
        if ($previousStatus !== 'archive') {
            StaffNotifier::documentEvent($request->user(), $document, 'archive');
        }

        return response()->json($document);
    }

    public function destroy(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        $document->delete();

        ActivityLogService::log($request->user()->id, 'suppression_document', $document->title, $document);
        StaffNotifier::documentEvent($request->user(), $document, 'supprime');

        return response()->json(['message' => 'Document supprimé.']);
    }

    private function userCanAccess($user, Document $document): bool
    {
        return $document->isAccessibleBy($user);
    }
}
