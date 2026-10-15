<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Filtres « Date / Jour de la semaine / Heure » d'une liste personnelle (Messages, Mes activités),
 * exprimés à l'heure locale (app.display_timezone) alors que les dates sont enregistrées en UTC.
 */
class LocalTimeFilter
{
    /** Règles de validation des paramètres de filtre. */
    public static function rules(): array
    {
        return [
            'date' => ['nullable', 'date_format:Y-m-d'],
            'time_from' => ['nullable', 'date_format:H:i'],
            'time_to' => ['nullable', 'date_format:H:i'],
            'weekday' => ['nullable', 'integer', Rule::in(range(1, 7))], // 1 = lundi … 7 = dimanche
        ];
    }

    public static function apply($query, array $filters, string $column = 'created_at'): void
    {
        $timezone = config('app.display_timezone', 'UTC');

        // Jour local → plage UTC.
        if ($date = $filters['date'] ?? null) {
            $day = Carbon::createFromFormat('Y-m-d', $date, $timezone);
            $query->whereBetween($column, [$day->copy()->startOfDay()->utc(), $day->copy()->endOfDay()->utc()]);
        }

        // Heure et jour de la semaine : calculés à l'heure locale, en PHP pour rester indépendant de la base
        // (listes personnelles, de taille modeste ; seuls l'identifiant et la date sont lus).
        $from = $filters['time_from'] ?? null;
        $to = $filters['time_to'] ?? null;
        $weekday = isset($filters['weekday']) ? (int) $filters['weekday'] : null;

        if (!$from && !$to && !$weekday) {
            return;
        }

        $model = $query->getModel();
        $ids = (clone $query)->setEagerLoads([])->reorder()->get([$model->getQualifiedKeyName(), $column])
            ->filter(function ($row) use ($column, $timezone, $from, $to, $weekday) {
                $local = Carbon::parse($row->getRawOriginal($column), 'UTC')->timezone($timezone);
                if ($weekday && $local->dayOfWeekIso !== $weekday) {
                    return false;
                }

                $time = $local->format('H:i');
                // Plage sur la nuit (ex. 22:00 → 06:00) : après le début OU avant la fin.
                if ($from && $to && $from > $to) {
                    return $time >= $from || $time <= $to;
                }

                return (!$from || $time >= $from) && (!$to || $time <= $to);
            })
            ->modelKeys();

        $query->whereIn($model->getQualifiedKeyName(), $ids);
    }
}
