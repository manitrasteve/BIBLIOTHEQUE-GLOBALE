<?php

namespace App\Support;

use App\Services\WeeklyDigest;
use Illuminate\Support\Facades\Cache;

/**
 * Digest hebdomadaire sans planificateur (même principe que ReminderKicker) : à partir du lundi 8 h,
 * une requête web lance au plus une fois par heure la commande `digest:hebdomadaire` en arrière-plan,
 * jusqu'à ce que le digest de la semaine soit parti (la commande n'envoie qu'une fois par semaine).
 */
class DigestKicker
{
    public static function maybeRun(): void
    {
        try {
            if (!app(WeeklyDigest::class)->isDue()) {
                return;
            }
            if (!Cache::add('weekly-digest-kick', true, now()->addHour())) {
                return;
            }

            $php = stripos(basename(PHP_BINARY), 'php') !== false ? PHP_BINARY : 'php';
            $command = '"' . $php . '" "' . base_path('artisan') . '" digest:hebdomadaire --quiet';
            $command = PHP_OS_FAMILY === 'Windows'
                ? 'start /B "" ' . $command . ' > NUL 2>&1'
                : $command . ' > /dev/null 2>&1 &';
            pclose(popen($command, 'r'));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
