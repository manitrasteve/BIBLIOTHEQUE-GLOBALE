<?php

namespace App\Services;

use App\Models\AccountRequest;
use App\Models\ActivityLog;
use App\Models\AiQuery;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\User;
use App\Support\AccountRequestRules;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Statistiques de la page « Statistiques » et du rapport mensuel : indicateurs du mois (comparés au mois
 * précédent), séries mensuelles, répartitions. Les mois sont découpés à l'heure de Madagascar
 * (app.display_timezone) ; les dates restent stockées en UTC.
 *
 * Les dates sont regroupées en PHP (et non en SQL) : même résultat sous MySQL et SQLite (tests).
 */
class PlatformStatistics
{
    private const MEMBER_ROLES = ['etudiant', 'enseignant', 'chercheur'];

    private string $tz;

    /**
     * @param  string  $month  mois de référence « AAAA-MM » (indicateurs, rapport) ; les séries s'arrêtent à ce mois
     * @param  int  $months  nombre de mois des séries (3, 6 ou 12)
     * @param  string|null  $establishment  code d'établissement (FSTE, FM…) : membres, demandes et activités filtrés
     */
    public function __construct(private string $month, private int $months = 12, private ?string $establishment = null)
    {
        $this->tz = config('app.display_timezone');
    }

    public function toArray(): array
    {
        $current = Carbon::createFromFormat('Y-m-d', $this->month.'-01', $this->tz)->startOfMonth();
        $previous = $current->copy()->subMonth();
        $seriesStart = $current->copy()->subMonths($this->months - 1);
        $seriesEnd = $current->copy()->endOfMonth();

        $labels = [];
        for ($m = $seriesStart->copy(); $m <= $current; $m->addMonth()) {
            $labels[$m->format('Y-m')] = $m->copy()->locale('fr')->translatedFormat('M Y');
        }

        $requests = $this->dates($this->requestsQuery(), 'created_at', $seriesStart->copy()->subMonth(), $seriesEnd);
        // Consultations lues une seule fois : séries mensuelles (depuis le mois précédant la série) et carte d'affluence.
        $consultationTimes = $this->localTimes($this->activityQuery(Consultation::query()), 'consulted_at', $seriesStart->copy()->subMonth(), $seriesEnd);
        $consultations = $consultationTimes->map(fn (\DateTimeImmutable $t) => $t->format('Y-m'));
        $aiQueries = $this->dates($this->activityQuery(AiQuery::query()), 'created_at', $seriesStart->copy()->subMonth(), $seriesEnd);

        // Comptage par mois fait une seule fois par série (et non un filtre complet par mois affiché).
        $byMonth = function (Collection $dates) use ($labels) {
            $counts = $dates->countBy();

            return array_map(fn ($key) => (int) ($counts[$key] ?? 0), array_keys($labels));
        };
        $count = fn (Collection $dates, Carbon $month) => (int) $dates->countBy()->get($month->format('Y-m'), 0);

        $members = $this->membersQuery()->where('is_active', true);
        $membersByRole = (clone $members)->toBase()->selectRaw('role, COUNT(*) as aggregate')->groupBy('role')->pluck('aggregate', 'role');

        return [
            'month' => $current->format('Y-m'),
            'month_label' => $current->copy()->locale('fr')->translatedFormat('F Y'),
            'establishment' => $this->establishment,
            'kpis' => [
                'active_members' => (clone $members)->count(),
                'new_members' => (clone $members)->whereBetween('created_at', $this->utcRange($current))->count(),
                'requests' => ['current' => $count($requests, $current), 'previous' => $count($requests, $previous)],
                'consultations' => ['current' => $count($consultations, $current), 'previous' => $count($consultations, $previous)],
                'ai_queries' => ['current' => $count($aiQueries, $current), 'previous' => $count($aiQueries, $previous)],
                'validation_hours' => ['current' => $this->averageValidationHours($current), 'previous' => $this->averageValidationHours($previous)],
                'published_documents' => [
                    'current' => Document::where('status', 'publie')->whereBetween('published_at', $this->utcRange($current))->count(),
                    'total' => Document::where('status', 'publie')->count(),
                ],
            ],
            'series' => [
                'labels' => array_values($labels),
                'keys' => array_keys($labels),
                'requests' => $byMonth($requests),
                'consultations' => $byMonth($consultations),
                'ai_queries' => $byMonth($aiQueries),
            ],
            'roles' => collect(self::MEMBER_ROLES)
                ->mapWithKeys(fn ($role) => [$role => (int) ($membersByRole[$role] ?? 0)])
                ->all(),
            'request_statuses' => $this->requestStatuses($current),
            'top_documents' => $this->topDocuments($seriesStart, $seriesEnd),
            'establishments' => $this->establishments(),
            // Carte d'affluence : nombre par jour de la semaine (0 = lundi … 6 = dimanche) et par heure locale (0 … 23).
            'affluence' => [
                'consultations' => $this->affluenceGrid($consultationTimes->filter(fn (\DateTimeImmutable $t) => $t >= $seriesStart)),
                'connexions' => $this->affluenceGrid($this->localTimes($this->activityQuery(ActivityLog::query()->where('action', 'connexion')), 'created_at', $seriesStart, $seriesEnd)),
            ],
        ];
    }

    /** Codes d'établissement disponibles pour le filtre (FSTE, FM, IOSTM…). */
    public static function establishmentOptions(): array
    {
        return collect(AccountRequestRules::SCHOOLS)
            ->map(fn ($name) => ['code' => AccountRequestRules::establishmentCode($name), 'name' => $name])
            ->all();
    }

    // ---------- Requêtes filtrées ----------

    /** Noms complets correspondant au code d'établissement filtré (un code peut couvrir un nom long). */
    private function establishmentNames(): array
    {
        return collect(AccountRequestRules::SCHOOLS)
            ->filter(fn ($name) => AccountRequestRules::establishmentCode($name) === $this->establishment)
            ->values()
            ->all();
    }

    private function membersQuery()
    {
        $query = User::query()->whereIn('role', self::MEMBER_ROLES);
        if ($this->establishment) {
            $query->whereIn('school', $this->establishmentNames());
        }

        return $query;
    }

    private function requestsQuery()
    {
        $query = AccountRequest::query();
        if ($this->establishment) {
            $query->whereIn('school', $this->establishmentNames());
        }

        return $query;
    }

    /** Consultations / questions IA : filtrées par l'établissement du membre. */
    private function activityQuery($query)
    {
        if ($this->establishment) {
            $query->whereHas('user', fn ($u) => $u->whereIn('school', $this->establishmentNames()));
        }

        return $query;
    }

    // ---------- Calculs ----------

    /**
     * Instants de la colonne sur la période, à l'heure locale. Valeurs brutes (toBase) converties avec
     * DateTimeImmutable : ni modèle Eloquent ni objet Carbon par ligne (des milliers de lignes par appel).
     */
    private function localTimes($query, string $column, Carbon $from, Carbon $to): Collection
    {
        $utc = new \DateTimeZone('UTC');
        $local = new \DateTimeZone($this->tz);

        return $query->whereBetween($column, [$from->copy()->utc(), $to->copy()->utc()])
            ->toBase()
            ->pluck($column)
            ->filter()
            ->map(fn ($value) => ($value instanceof \DateTimeInterface
                ? \DateTimeImmutable::createFromInterface($value)
                : new \DateTimeImmutable((string) $value, $utc))->setTimezone($local))
            ->values();
    }

    /** Dates de la colonne sur la période, converties en mois « AAAA-MM » à l'heure locale. */
    private function dates($query, string $column, Carbon $from, Carbon $to): Collection
    {
        return $this->localTimes($query, $column, $from, $to)->map(fn (\DateTimeImmutable $t) => $t->format('Y-m'));
    }

    /** Grille 7 × 24 : jour de la semaine (ISO, lundi = 0) × heure locale. */
    private function affluenceGrid(Collection $times): array
    {
        $grid = array_fill(0, 7, array_fill(0, 24, 0));

        foreach ($times as $local) {
            $grid[(int) $local->format('N') - 1][(int) $local->format('G')]++;
        }

        return $grid;
    }

    private function utcRange(Carbon $month): array
    {
        return [$month->copy()->startOfMonth()->utc(), $month->copy()->endOfMonth()->utc()];
    }

    /** Délai moyen (heures) entre la demande et sa validation, pour les demandes validées ce mois-là. */
    private function averageValidationHours(Carbon $month): ?float
    {
        $rows = $this->requestsQuery()
            ->where('status', 'validee')
            ->whereNotNull('processed_at')
            ->whereBetween('processed_at', $this->utcRange($month))
            ->get(['created_at', 'processed_at']);

        if ($rows->isEmpty()) {
            return null;
        }

        return round($rows->avg(fn ($r) => max(0, $r->created_at->diffInMinutes($r->processed_at)) / 60), 1);
    }

    /** Demandes reçues pendant le mois, par statut actuel (« validee » = compte activé). */
    private function requestStatuses(Carbon $month): array
    {
        $rows = $this->requestsQuery()
            ->whereBetween('created_at', $this->utcRange($month))
            ->toBase()
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($n) => (int) $n);

        return [
            'received' => (int) $rows->sum(),
            'en_attente' => (int) ($rows['en_attente'] ?? 0),
            'verifiee' => (int) ($rows['verifiee'] ?? 0),
            'validee' => (int) ($rows['validee'] ?? 0),
            'rejetee' => (int) ($rows['rejetee'] ?? 0),
            'expiree' => (int) ($rows['expiree'] ?? 0),
        ];
    }

    /** Les 5 documents les plus consultés sur la période des séries. */
    private function topDocuments(Carbon $from, Carbon $to): array
    {
        // Regroupement en SQL (et non toutes les consultations de la période chargées en PHP).
        // Égalité : le document consulté en premier passe devant (ordre de l'ancien countBy()->sortDesc()).
        $counts = $this->activityQuery(Consultation::query())
            ->whereBetween('consulted_at', [$from->copy()->utc(), $to->copy()->utc()])
            ->toBase()
            ->selectRaw('document_id, COUNT(*) as views, MIN(id) as first_id')
            ->groupBy('document_id')
            ->orderByDesc('views')
            ->orderBy('first_id')
            ->limit(5)
            ->pluck('views', 'document_id')
            ->map(fn ($views) => (int) $views);

        $titles = Document::withTrashed()->whereIn('id', $counts->keys())->pluck('title', 'id');

        return $counts->map(fn ($views, $id) => ['id' => $id, 'title' => $titles[$id] ?? 'Document supprimé', 'views' => $views])
            ->values()
            ->all();
    }

    /** Membres actifs par établissement (code court), du plus grand au plus petit. */
    private function establishments(): array
    {
        // Comptage par libellé en SQL ; plusieurs libellés pouvant donner le même code, on additionne ensuite
        // par code (égalité : ordre de première apparition, comme l'ancien countBy()->sortDesc()).
        $codes = [];
        $this->membersQuery()
            ->where('is_active', true)
            ->toBase()
            ->selectRaw('school, COUNT(*) as aggregate, MIN(id) as first_id')
            ->groupBy('school')
            ->get()
            ->each(function ($row) use (&$codes) {
                $code = ($row->school ? AccountRequestRules::establishmentCode($row->school) : null) ?? 'Non renseigné';
                $codes[$code] ??= ['members' => 0, 'first_id' => PHP_INT_MAX];
                $codes[$code]['members'] += (int) $row->aggregate;
                $codes[$code]['first_id'] = min($codes[$code]['first_id'], (int) $row->first_id);
            });

        return collect($codes)
            ->sortBy([['members', 'desc'], ['first_id', 'asc']])
            ->map(fn ($c, $code) => ['code' => $code, 'members' => $c['members']])
            ->values()
            ->all();
    }
}
