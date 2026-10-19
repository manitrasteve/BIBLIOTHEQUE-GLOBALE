<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountRequest;
use App\Models\AiQuery;
use App\Models\Consultation;
use App\Models\Favorite;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Dashboard de l'utilisateur connecté.
     *
     * Renvoie :
     * - chiffres du jour (compat ancienne version) : today_consultations, today_ai_queries, favorites, unread_notifications
     * - chiffres du mois + variation vs mois précédent : month_* / month_*_delta (null si pas d'historique)
     * - série 30 derniers jours : activity[] [{date, consultations, ai_queries}]
     * - top 4 domaines consultés : top_categories[] [{name, count}]
     * - 3 lectures en cours : current_readings[] [{slug, title, type, last_page, total_pages, percent}]
     * - 3 dernières notifications : recent_activities[] [{type, title, created_at, related_url}]
     */
    public function me(Request $request)
    {
        $user = $request->user();
        // Jours et mois à l'heure de Madagascar (les dates sont stockées en UTC) : sans cela, une activité
        // entre 0 h et 3 h était comptée la veille, et celles du 1er du mois avant 3 h le mois précédent.
        $tz = config('app.display_timezone');
        $local = now($tz);
        $todayRange = [$local->copy()->startOfDay()->utc(), $local->copy()->endOfDay()->utc()];
        $thirtyDaysAgo = $local->copy()->subDays(29)->startOfDay()->utc();

        $monthStart = $local->copy()->startOfMonth()->utc();
        $prevMonthStart = $local->copy()->subMonthNoOverflow()->startOfMonth()->utc();

        // Borne haute exclusive (`<` $monthStart) : évite de compter deux fois une activité
        // enregistrée exactement à 00:00:00 le 1er du mois (whereBetween est inclusif).
        $monthConsultations = $user->consultations()->where('consulted_at', '>=', $monthStart)->count();
        $prevMonthConsultations = $user->consultations()
            ->where('consulted_at', '>=', $prevMonthStart)
            ->where('consulted_at', '<', $monthStart)
            ->count();

        $monthAiQueries = $user->aiQueries()->where('created_at', '>=', $monthStart)->count();
        $prevMonthAiQueries = $user->aiQueries()
            ->where('created_at', '>=', $prevMonthStart)
            ->where('created_at', '<', $monthStart)
            ->count();

        $monthNewFavorites = $user->favorites()->where('created_at', '>=', $monthStart)->count();

        // Série sur 30 jours : groupée par date, pour la courbe d'activité (dates sans activité remplies à 0 côté client).
        $activityRaw = $user->consultations()
            ->where('consulted_at', '>=', $thirtyDaysAgo)
            ->pluck('consulted_at')
            ->countBy(fn ($date) => \Illuminate\Support\Carbon::parse($date, 'UTC')->setTimezone($tz)->toDateString());
        $activity = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = $local->copy()->subDays($i)->toDateString();
            $activity[] = ['date' => $date, 'consultations' => (int) ($activityRaw[$date] ?? 0)];
        }

        // Top 4 domaines consultés par cet utilisateur (sur toute la période).
        $topCategories = $user->consultations()
            ->join('documents', 'consultations.document_id', '=', 'documents.id')
            ->join('categories', 'documents.category_id', '=', 'categories.id')
            ->selectRaw('categories.name as name, COUNT(*) as count')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('count')
            ->limit(4)
            ->get()
            ->map(fn ($row) => ['name' => $row->name, 'count' => (int) $row->count])
            ->all();

        // Lectures en cours : 3 documents avec progression de lecture (page en cours), ordonnés par dernière mise à jour.
        $currentReadings = DB::table('reading_progress')
            ->join('documents', 'reading_progress.document_id', '=', 'documents.id')
            ->where('reading_progress.user_id', $user->id)
            ->where('documents.status', 'publie')
            ->orderByDesc('reading_progress.updated_at')
            ->limit(3)
            ->get(['documents.slug', 'documents.title', 'documents.type', 'reading_progress.last_page', 'reading_progress.total_pages'])
            ->map(function ($row) {
                $percent = ($row->total_pages && $row->last_page)
                    ? min(100, (int) round(($row->last_page / $row->total_pages) * 100))
                    : null;
                return [
                    'slug' => $row->slug,
                    'title' => $row->title,
                    'type' => $row->type,
                    'last_page' => (int) $row->last_page,
                    'total_pages' => $row->total_pages ? (int) $row->total_pages : null,
                    'percent' => $percent,
                ];
            })
            ->all();

        return response()->json([
            // --- Compat ancienne version (ne pas retirer) -----------------
            'today_consultations' => $user->consultations()->whereBetween('consulted_at', $todayRange)->count(),
            'today_ai_queries' => $user->aiQueries()->whereBetween('created_at', $todayRange)->count(),
            'favorites' => $user->favorites()->count(),
            'unread_notifications' => $user->appNotifications()->unread()->count(),

            // --- Chiffres du mois + variation -----------------------------
            'month_consultations' => $monthConsultations,
            'month_consultations_delta' => self::delta($monthConsultations, $prevMonthConsultations),
            'month_ai_queries' => $monthAiQueries,
            'month_ai_queries_delta' => self::delta($monthAiQueries, $prevMonthAiQueries),
            'month_new_favorites' => $monthNewFavorites,

            // --- Graphiques et listes -------------------------------------
            'activity' => $activity,
            'top_categories' => $topCategories,
            'current_readings' => $currentReadings,
        ]);
    }

    // Variation en pourcentage (arrondi) ; null si pas de référence.
    private static function delta(int $current, int $previous): ?int
    {
        if ($previous === 0) {
            return $current === 0 ? 0 : null;
        }

        return (int) round((($current - $previous) / $previous) * 100);
    }

    /**
     * Dashboard de l'administrateur.
     */
    /**
     * Graphiques de la page Statistiques et rapport mensuel : indicateurs du mois (vs mois précédent),
     * séries mensuelles, répartitions. Filtres : mois de référence, nombre de mois, établissement.
     */
    public function statistics(Request $request)
    {
        abort_unless($request->user()->hasPermission('voir_statistiques'), 403);

        $codes = collect(\App\Services\PlatformStatistics::establishmentOptions())->pluck('code')->all();
        $data = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
            'months' => ['nullable', 'integer', 'in:3,6,12'],
            'establishment' => ['nullable', 'string', \Illuminate\Validation\Rule::in($codes)],
        ]);

        $month = $data['month'] ?? now(config('app.display_timezone'))->format('Y-m');
        $stats = new \App\Services\PlatformStatistics($month, (int) ($data['months'] ?? 12), $data['establishment'] ?? null);

        return response()->json([
            ...$stats->toArray(),
            'establishment_options' => \App\Services\PlatformStatistics::establishmentOptions(),
        ]);
    }

    public function admin(Request $request)
    {
        abort_unless($request->user()->hasPermission('voir_statistiques'), 403);

        // Le bibliothécaire ne voit que les chiffres de sa bibliothèque (l'administrateur : la plateforme entière).
        $me = $request->user();
        $ofMyLibrary = fn ($query) => $me->isAdmin()
            ? $query
            : $query->whereHas('document', fn ($d) => $me->restrictToManagedLibrary($d));

        return response()->json([
            'total_users' => $me->restrictToManagedLibrary(\App\Models\User::query())->count(),

            'pending_account_validations' => $me->restrictToManagedLibrary(AccountRequest::where(
                'status',
                'verifiee'
            ))->count(),

            'total_documents' => $me->restrictToManagedLibrary(\App\Models\Document::where(
                'status',
                'publie'
            ))->count(),

            'pending_account_requests' => $me->restrictToManagedLibrary(AccountRequest::where(
                'status',
                'en_attente'
            ))->count(),

            'total_consultations' => $ofMyLibrary(Consultation::query())->count(),

            'total_ai_queries' => $ofMyLibrary(AiQuery::query())->count(),

            'total_favorites' => $ofMyLibrary(Favorite::query())->count(),
        ]);
    }
}