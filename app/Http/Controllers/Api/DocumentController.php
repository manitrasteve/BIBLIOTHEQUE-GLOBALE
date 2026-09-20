<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Consultation;
use App\Models\Document;
use App\Services\ActivityLogService;
use App\Services\DocumentIngestionService;
use App\Services\NotificationService;
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

    public function __construct(
        private readonly DocumentIngestionService $ingestionService,
    ) {
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
        if ($library = $request->get('library_id')) {
            $query->where('library_id', $library);
        }

        return response()->json($query->orderByDesc('created_at')->paginate(20));
    }

    // Fiche complète pour l'écran d'édition (tous statuts, tous champs).
    public function manageShow(Document $document)
    {
        return response()->json($document->load(['authors:id,name', 'category:id,name', 'library:id,name']));
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

        // Extraction du texte + découpage + embeddings Gemini, pour que le
        // module IA (question-réponse) puisse répondre sur ce document dès
        // sa mise en ligne. Ne bloque pas la création si Gemini échoue
        // (ex: clé API absente) : la faute est simplement journalisée.
        $this->ingestionService->ingest($document);

        return response()->json($document, 201);
    }

    public function update(Request $request, Document $document)
    {
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
        if ($request->hasFile('file')) { $data['file_path']=$request->file('file')->store('documents','local'); }
        if ($request->hasFile('cover')) { $data['cover_path']=$request->file('cover')->store('covers','public'); }
        if (!empty($data['category'])) {
            $data['category_id'] = $this->resolveCategoryId($data['category']);
        }
        unset($data['file'], $data['cover'], $data['category']);
        $document->update($data);
        if (isset($data['author_ids'])) $document->authors()->sync($data['author_ids']);
        if ($request->hasFile('file')) $this->ingestionService->ingest($document->fresh());
        return response()->json($document->fresh()->load('authors'));
    }

    // Publication : change le statut et notifie Admin/Bibliothécaire + utilisateurs concernés
    public function publish(Request $request, Document $document)
    {
        $document->update(['status' => 'publie', 'published_at' => now()]);

        ActivityLogService::log($request->user()->id, 'publication_document', $document->title, $document);

        \App\Models\User::where('is_active', true)->whereKeyNot($request->user()->id)->get()->each(fn ($user) =>
            NotificationService::send($user, 'document_publie', 'Nouveau document publié', "« {$document->title} » vient d'être publié.", $document)
        );

        return response()->json($document);
    }

    public function reindex(Request $request, Document $document)
    {
        $this->ingestionService->ingest($document);
        return response()->json(['message'=>'Indexation RAG relancée.','chunks'=>$document->chunks()->count()]);
    }

    public function archive(Document $document)
    {
        $document->update(['status' => 'archive']);

        return response()->json($document);
    }

    public function destroy(Document $document)
    {
        $document->delete();

        return response()->json(['message' => 'Document supprimé.']);
    }

    private function userCanAccess($user, Document $document): bool
    {
        return $document->isAccessibleBy($user);
    }
}
