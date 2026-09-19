<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SearchHistory;
use App\Models\WatchTopic;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Espace du chercheur : historique des recherches et veille scientifique.
// Routes protégées par role:chercheur ; chaque ligne appartient à l'utilisateur connecté.
class ResearchController extends Controller
{
    private const FILTER_KEYS = ['author', 'category_id', 'type', 'year', 'library_id', 'language'];

    // ===== Mes recherches =====

    public function searches(Request $request)
    {
        return response()->json(
            SearchHistory::where('user_id', $request->user()->id)->latest('updated_at')->paginate(20)
        );
    }

    public function storeSearch(Request $request)
    {
        $data = $request->validate([
            'query' => ['required', 'string', 'max:255'],
            'filters' => ['nullable', 'array'],
        ]);

        $query = trim($data['query']);
        abort_if($query === '', 422, 'La recherche est vide.');

        $filters = collect($data['filters'] ?? [])
            ->only(self::FILTER_KEYS)
            ->filter(fn ($value) => is_scalar($value) && (string) $value !== '')
            ->map(fn ($value) => (string) $value)
            ->sortKeys()
            ->all();

        $search = SearchHistory::where('user_id', $request->user()->id)
            ->whereRaw('LOWER(query) = ?', [mb_strtolower($query)])
            ->get()
            ->first(fn (SearchHistory $s) => ($s->filters ?? []) == $filters);

        if ($search) {
            $search->touch();
        } else {
            $search = SearchHistory::create([
                'user_id' => $request->user()->id,
                'query' => $query,
                'filters' => $filters ?: null,
            ]);
            ActivityLogService::log($request->user()->id, 'recherche', $query);
        }

        return response()->json($search, 201);
    }

    public function destroySearch(Request $request, SearchHistory $search)
    {
        abort_unless($search->user_id === $request->user()->id, 404);
        $search->delete();

        return response()->json(['message' => 'Recherche supprimée.']);
    }

    public function clearSearches(Request $request)
    {
        SearchHistory::where('user_id', $request->user()->id)->delete();

        return response()->json(['message' => 'Historique effacé.']);
    }

    // ===== Veille scientifique =====

    public function topics(Request $request)
    {
        $topics = WatchTopic::with('category:id,name')
            ->where('user_id', $request->user()->id)
            ->latest()
            ->get()
            ->map(fn (WatchTopic $t) => $this->topicPayload($t));

        return response()->json(['data' => $topics]);
    }

    public function storeTopic(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['mot_cle', 'domaine'])],
            'term' => ['required_if:type,mot_cle', 'nullable', 'string', 'max:120'],
            'category_id' => ['required_if:type,domaine', 'nullable', 'integer', Rule::exists('categories', 'id')],
        ]);

        $user = $request->user();
        $attributes = $data['type'] === 'domaine'
            ? ['user_id' => $user->id, 'type' => 'domaine', 'category_id' => $data['category_id']]
            : ['user_id' => $user->id, 'type' => 'mot_cle', 'term' => trim($data['term'])];

        if ($data['type'] === 'mot_cle') {
            abort_if($attributes['term'] === '', 422, 'Le mot-clé est vide.');
        }

        $existing = WatchTopic::where('user_id', $user->id)->where('type', $data['type'])
            ->when(
                $data['type'] === 'domaine',
                fn ($q) => $q->where('category_id', $data['category_id']),
                fn ($q) => $q->whereRaw('LOWER(term) = ?', [mb_strtolower($attributes['term'])]),
            )->exists();

        abort_if($existing, 422, 'Ce thème est déjà suivi.');

        // Seuls les documents publiés après le début du suivi sont « nouveaux ».
        $topic = WatchTopic::create($attributes + ['last_seen_at' => now()]);

        return response()->json($this->topicPayload($topic->load('category:id,name')), 201);
    }

    public function destroyTopic(Request $request, WatchTopic $topic)
    {
        abort_unless($topic->user_id === $request->user()->id, 404);
        $topic->delete();

        return response()->json(['message' => 'Thème supprimé.']);
    }

    // Documents correspondant à un thème ; les nouveautés sont signalées puis marquées comme vues.
    public function topicDocuments(Request $request, WatchTopic $topic)
    {
        abort_unless($topic->user_id === $request->user()->id, 404);

        $since = $topic->last_seen_at;
        $documents = $topic->matchingDocuments()
            ->with(['authors:id,name', 'category:id,name'])
            ->orderByDesc('published_at')
            ->paginate(10);

        $documents->getCollection()->transform(fn ($d) => [
            'slug' => $d->slug,
            'title' => $d->title,
            'type' => $d->type,
            'year' => $d->year,
            'authors' => $d->authors->pluck('name'),
            'category' => $d->category?->name,
            'published_at' => $d->published_at,
            'is_new' => $since && $d->published_at && $d->published_at->gt($since),
        ]);

        if ((int) $request->get('page', 1) === 1) {
            $topic->update(['last_seen_at' => now()]);
        }

        return response()->json($documents);
    }

    private function topicPayload(WatchTopic $topic): array
    {
        $matching = $topic->matchingDocuments();

        return [
            'id' => $topic->id,
            'type' => $topic->type,
            'label' => $topic->type === 'domaine' ? $topic->category?->name : $topic->term,
            'category_id' => $topic->category_id,
            'total' => (clone $matching)->count(),
            'new_count' => $topic->last_seen_at
                ? (clone $matching)->where('published_at', '>', $topic->last_seen_at)->count()
                : 0,
            'created_at' => $topic->created_at,
        ];
    }
}
