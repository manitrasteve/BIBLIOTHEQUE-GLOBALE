<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Support\LocalTimeFilter;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    // Admin : historique global. Utilisateur : ses propres activités (voir routes).
    public function index(Request $request)
    {
        // Recherche + filtres date / jour de la semaine / heure (heure locale) de « Mes activités ».
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            ...LocalTimeFilter::rules(),
        ]);

        $query = ActivityLog::with(['user:id,name,role', 'library:id,name'])->orderByDesc('created_at')->orderByDesc('id');

        // `mine=1` : « Mes activités » — même pour l'administrateur, uniquement ses propres actions.
        if (!$request->user()->isAdmin() || $request->boolean('mine')) {
            $query->where('user_id', $request->user()->id);
        } elseif ($action = $request->get('action')) {
            $query->where('action', $action);
        }

        // Mot recherché dans la description, l'élément concerné ou le code de l'action
        // (« favori » trouve ajout_favori / retrait_favori). Les libellés affichés sont résolus côté client.
        if (filled($filters['search'] ?? null)) {
            $term = trim($filters['search']);
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $term) . '%';
            // Espaces → « _ » des codes (« ajout favori » → ajout_favori) ; « _ » reste un joker d'un caractère.
            $actionLike = '%' . str_replace(['%', ' '], ['', '_'], mb_strtolower($term)) . '%';
            $actions = array_values(array_filter((array) $request->input('actions'), 'is_string'));

            $query->where(fn ($q) => $q
                ->where('description', 'like', $like)
                ->orWhere('subject_label', 'like', $like)
                ->orWhere('action', 'like', $actionLike)
                ->when($actions, fn ($q) => $q->orWhereIn('action', $actions)));
        }

        LocalTimeFilter::apply($query, $filters);

        return response()->json($query->paginate(30));
    }
}
