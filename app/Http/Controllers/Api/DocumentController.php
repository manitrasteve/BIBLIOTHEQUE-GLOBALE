<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\IngestDocumentJob;
use App\Models\Category;
use App\Models\Consultation;
use App\Models\Document;
use App\Services\ActivityLogService;
use App\Services\DocumentPublisher;
use App\Services\StaffNotifier;
use App\Support\QueueKicker;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentController extends Controller
{
    // Type et langue sont désormais saisis librement ; les filtres du catalogue envoient encore les
    // anciens codes : on accepte le code OU son libellé pour retrouver aussi les documents saisis en texte.
    private const TYPE_LABELS = ['livre' => 'Livre', 'memoire' => 'Mémoire', 'these' => 'Thèse', 'rapport' => 'Rapport', 'autre' => 'Autre'];
    private const LANGUAGE_LABELS = ['fr' => 'Français', 'mg' => 'Malgache', 'en' => 'Anglais', 'es' => 'Espagnol', 'pt' => 'Portugais', 'it' => 'Italien', 'ru' => 'Russe', 'autre' => 'Autre'];

    // Colonnes de l'index plein texte (migration add_fulltext_index_to_documents).
    private const FULLTEXT_COLUMNS = ['title', 'subtitle', 'abstract', 'keywords'];

    private function supportsFullText(): bool
    {
        return in_array(Document::query()->getConnection()->getDriverName(), ['mysql', 'mariadb'], true);
    }

    private function withLabel(string $value, array $labels): array
    {
        return array_values(array_unique(array_filter([$value, $labels[mb_strtolower($value)] ?? null])));
    }

    // Paramètre texte d'une route publique : « ?q[]=… » (tableau) est ignoré au lieu de provoquer une erreur 500.
    private function textParam(Request $request, string $key): string
    {
        $value = $request->query($key);

        return is_scalar($value) ? (string) $value : '';
    }

    // Catégorie saisie librement : retrouve la catégorie existante (nom sans casse, ou même slug) ou la crée.
    private function resolveCategoryId(string $name): int
    {
        return Category::resolveId($name);
    }

    // Recherche publique : titre, auteur, catégorie, année, bibliothèque, mot-clé.
    // Accessible sans connexion, mais ne renvoie que les métadonnées.
    public function index(Request $request)
    {
        $query = Document::query()
            ->with(['authors:id,name', 'category:id,name', 'library:id,name'])
            ->withCount(['consultations','favorites','aiQueries'])
            ->where('status', 'publie');

        $search = trim($this->textParam($request, 'q'));
        $fullText = $search !== '' && ! in_array($request->get('by'), ['title', 'author', 'category', 'keyword'], true) && $this->supportsFullText();

        if ($search !== '') {
            // « Rechercher dans » (by) : un seul champ ; sans by, recherche large (titre, mots-clés, auteurs,
            // et le résumé via l'index plein texte quand la base le permet).
            match ($request->get('by')) {
                'title' => $query->where('title', 'like', "%{$search}%"),
                'author' => $query->whereHas('authors', fn ($a) => $a->where('name', 'like', "%{$search}%")),
                'category' => $query->whereHas('category', fn ($c) => $c->where('name', 'like', "%{$search}%")),
                'keyword' => $query->where('keywords', 'like', "%{$search}%"),
                default => $query->where(function ($q) use ($search, $fullText) {
                    $q->where('title', 'like', "%{$search}%")
                      ->orWhere('keywords', 'like', "%{$search}%")
                      ->orWhereHas('authors', fn ($a) => $a->where('name', 'like', "%{$search}%"));
                    // Mots entiers n'importe où (résumé compris), ordre des mots indifférent.
                    if ($fullText) {
                        $q->orWhereFullText(self::FULLTEXT_COLUMNS, $search);
                    }
                }),
            };
        }

        // Filtre optionnel par auteur (Espace recherche du chercheur).
        if ($author = $this->textParam($request, 'author')) {
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

        // Route publique : si un jeton valide accompagne la requête, on indique les favoris de ce lecteur.
        if ($viewer = auth('sanctum')->user()) {
            $query->withExists(['favorites as is_favorited' => fn ($f) => $f->where('user_id', $viewer->id)]);
        }

        // Avec une recherche : les plus pertinents d'abord (titre qui contient la saisie, puis score plein texte).
        if ($fullText) {
            $query->orderByRaw('(title LIKE ?) DESC', ["%{$search}%"])
                ->orderByRaw('MATCH(' . implode(', ', self::FULLTEXT_COLUMNS) . ') AGAINST (? IN NATURAL LANGUAGE MODE) DESC', [$search]);
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
            'is_favorited' => (bool) ($d->is_favorited ?? false),
        ]);

        return response()->json($documents);
    }

    // Suggestions de la barre de recherche (pendant la frappe) : quelques titres et auteurs publiés.
    public function suggestions(Request $request)
    {
        $search = trim($this->textParam($request, 'q'));
        if (mb_strlen($search) < 2) {
            return response()->json(['documents' => [], 'authors' => []]);
        }

        $documents = Document::query()
            ->where('status', 'publie')
            ->where('title', 'like', "%{$search}%")
            // Titres qui commencent par la saisie d'abord.
            ->orderByRaw('(title LIKE ?) DESC', ["{$search}%"])
            ->orderBy('title')
            ->limit(6)
            ->get(['slug', 'title', 'year']);

        $authors = \App\Models\Author::query()
            ->where('name', 'like', "%{$search}%")
            ->whereHas('documents', fn ($d) => $d->where('status', 'publie'))
            ->orderBy('name')
            ->limit(4)
            ->pluck('name');

        return response()->json(['documents' => $documents, 'authors' => $authors]);
    }

    // « Documents similaires » d'une fiche : auteurs communs (+3), même catégorie (+2), mot-clé commun (+1 chacun).
    public function similar(string $slug)
    {
        $document = Document::with('authors:id')->where('slug', $slug)->where('status', 'publie')->firstOrFail();
        $authorIds = $document->authors->pluck('id');
        $keywords = $this->keywordList($document->keywords);

        $candidates = Document::query()
            ->with(['authors:id,name', 'category:id,name'])
            ->where('status', 'publie')
            ->whereKeyNot($document->id)
            ->where(function ($q) use ($document, $authorIds, $keywords) {
                $q->where('category_id', $document->category_id)
                    ->when($authorIds->isNotEmpty(), fn ($q) => $q->orWhereHas('authors', fn ($a) => $a->whereIn('authors.id', $authorIds)))
                    ->when($keywords, fn ($q) => $q->orWhere(function ($k) use ($keywords) {
                        foreach (array_slice($keywords, 0, 8) as $keyword) {
                            $k->orWhere('keywords', 'like', "%{$keyword}%");
                        }
                    }));
            })
            ->latest('published_at')
            ->limit(100)
            ->get();

        $similar = $candidates
            ->map(function (Document $d) use ($document, $authorIds, $keywords) {
                $score = 3 * $d->authors->pluck('id')->intersect($authorIds)->count()
                    + ((int) $d->category_id === (int) $document->category_id ? 2 : 0)
                    + count(array_intersect($keywords, $this->keywordList($d->keywords)));

                return ['score' => $score, 'document' => $d];
            })
            ->filter(fn ($row) => $row['score'] > 0)
            ->sortByDesc('score')
            ->take(6)
            ->values()
            ->map(fn ($row) => [
                'slug' => $row['document']->slug,
                'title' => $row['document']->title,
                'type' => $row['document']->type,
                'year' => $row['document']->year,
                'authors' => $row['document']->authors->pluck('name'),
                'category' => $row['document']->category?->name,
                'cover_url' => $row['document']->cover_path ? Storage::url($row['document']->cover_path) : null,
            ]);

        return response()->json($similar);
    }

    // Mots-clés saisis librement (« droit, économie ; finances ») → liste en minuscules, sans doublon.
    private function keywordList(?string $keywords): array
    {
        return collect(preg_split('/[,;]+/u', (string) $keywords))
            ->map(fn ($k) => mb_strtolower(trim($k)))
            ->filter(fn ($k) => mb_strlen($k) >= 3)
            ->unique()
            ->values()
            ->all();
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
            // « Reprendre la lecture » : dernière page lue par ce lecteur (null s'il n'a jamais ouvert le document).
            'reading_progress' => $canView
                ? \App\Models\ReadingProgress::where('user_id', $request->user()->id)->where('document_id', $document->id)->first(['last_page', 'total_pages', 'updated_at'])
                : null,
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
            'soumis' => (int) ($byStatus['soumis'] ?? 0),
            'refuse' => (int) ($byStatus['refuse'] ?? 0),
            'programme' => (int) ($byStatus['programme'] ?? 0),
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

    /**
     * Règles de création d'un document : source unique partagée par la création
     * manuelle (store) et la vérification d'un lot importé (DocumentImportService).
     */
    public static function creationRules(): array
    {
        return [
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
        ];
    }

    // Bibliothécaire / Admin : création d'un document (statut brouillon par défaut)
    public function store(Request $request)
    {
        $data = $request->validate(self::creationRules());

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
        $previousFiles = ['local' => $document->file_path, 'public' => $document->cover_path];
        $document->update($data);
        // Fichiers remplacés : l'ancien PDF / l'ancienne couverture ne restent pas orphelins sur le disque.
        if (isset($data['file_path']) && $previousFiles['local']) Storage::disk('local')->delete($previousFiles['local']);
        if (isset($data['cover_path']) && $previousFiles['public']) Storage::disk('public')->delete($previousFiles['public']);
        // Le formulaire renvoie toujours la liste complète des auteurs cochés ; si elle est
        // vidée, FormData n'envoie aucune entrée "author_ids[]" (la clé est alors absente de
        // la requête). On synchronise donc toujours, avec [] par défaut, pour bien retirer
        // tous les auteurs plutôt que de laisser silencieusement les anciens en place.
        // Une mise à jour JSON partielle (sans author_ids) ne touche pas aux auteurs.
        if (array_key_exists('author_ids', $data) || ! $request->isJson()) {
            $document->authors()->sync($data['author_ids'] ?? []);
        }

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

        // Déjà publié (double clic, deux onglets) : ne pas renotifier tous les utilisateurs ni changer la date.
        if ($document->status === 'publie') {
            return response()->json($document);
        }

        DocumentPublisher::publish($document, $request->user()->id);

        return response()->json($document);
    }

    // Publication programmée : le document passe en « programme » et sera publié à la date choisie
    // (DocumentPublisher::publishDue, lancé chaque minute). Reprogrammer change simplement la date.
    public function schedule(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        if ($document->status === 'publie') {
            return response()->json(['message' => 'Ce document est déjà publié.'], 422);
        }

        $data = $request->validate([
            // La minute en cours est acceptée (publication dans la minute qui suit).
            'scheduled_at' => ['required', 'date', 'after_or_equal:' . now()->startOfMinute()->toIso8601String(), 'before:' . now()->addYear()->toIso8601String()],
        ], [
            'scheduled_at.after_or_equal' => 'Cette date est déjà passée : choisissez une date et une heure à venir.',
            'scheduled_at.before' => 'La date de publication doit être dans moins d’un an.',
        ]);

        $previousStatus = $document->status;
        $previousDate = $document->scheduled_at;
        $document->update([
            'status' => 'programme',
            'scheduled_at' => Carbon::parse($data['scheduled_at']),
            'scheduled_by' => $request->user()->id,
        ]);

        ActivityLogService::log(
            $request->user()->id,
            'programmation_document',
            $document->title,
            $document,
            [
                'status' => ['before' => $previousStatus, 'after' => 'programme'],
                'publication_prevue' => [
                    'before' => $previousDate?->toIso8601String(),
                    'after' => $document->scheduled_at->toIso8601String(),
                ],
            ],
        );

        return response()->json($document);
    }

    // Annule la programmation : le document redevient un brouillon.
    public function unschedule(Request $request, Document $document)
    {
        $this->authorizeLibrary($request, $document->library_id);

        if ($document->status !== 'programme') {
            return response()->json($document);
        }

        $previousDate = $document->scheduled_at;
        $document->update(['status' => 'brouillon', 'scheduled_at' => null, 'scheduled_by' => null]);

        ActivityLogService::log(
            $request->user()->id,
            'annulation_programmation_document',
            $document->title,
            $document,
            [
                'status' => ['before' => 'programme', 'after' => 'brouillon'],
                'publication_prevue' => ['before' => $previousDate?->toIso8601String(), 'after' => null],
            ],
        );

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
        $document->update(['status' => 'archive', 'scheduled_at' => null, 'scheduled_by' => null]);

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
