<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Ce projet tourne souvent sans planificateur (`schedule:work` / tâche Windows). Pour que les rappels
 * « créez votre mot de passe » partent quand même, une requête web lance au plus une fois par heure la
 * commande `comptes:rappel-mot-de-passe` en arrière-plan (comme QueueKicker pour la file d'attente) :
 * la réponse n'attend pas l'envoi des e-mails.
 */
class ReminderKicker
{
    public static function maybeRun(): void
    {
        // Verrou d'une heure : un seul lancement par heure, quel que soit le nombre de visiteurs.
        if (!Cache::add('setup-link-reminder-kick', true, now()->addHour())) {
            return;
        }

        try {
            $php = stripos(basename(PHP_BINARY), 'php') !== false ? PHP_BINARY : 'php';
            $command = '"' . $php . '" "' . base_path('artisan') . '" comptes:rappel-mot-de-passe --quiet';
            $command = PHP_OS_FAMILY === 'Windows'
                ? 'start /B "" ' . $command . ' > NUL 2>&1'
                : $command . ' > /dev/null 2>&1 &';
            pclose(popen($command, 'r'));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
