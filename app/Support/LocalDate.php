<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Date du jour et année à l'heure locale (app.display_timezone, Madagascar UTC+3).
 * L'application tourne en UTC : « today » / now()->year y donnaient encore la veille (ou l'année
 * précédente le 1er janvier) entre minuit et 3 h, heure locale.
 */
class LocalDate
{
    public static function now(): Carbon
    {
        return now(config('app.display_timezone', 'UTC'));
    }

    /** Date du jour (Y-m-d), utilisable dans une règle : 'before_or_equal:' . LocalDate::today(). */
    public static function today(): string
    {
        return self::now()->toDateString();
    }

    public static function year(): int
    {
        return self::now()->year;
    }
}
