<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Rappel « créez votre mot de passe » avant l'expiration du lien de 72 h (une fois par lien).
// Lancée chaque heure par le planificateur s'il tourne, sinon par App\Support\ReminderKicker.
Artisan::command('comptes:rappel-mot-de-passe', function (\App\Services\SetupLinkReminder $reminder) {
    $this->info($reminder->sendDue() . ' rappel(s) envoyé(s).');
})->purpose('Rappelle aux nouveaux comptes de créer leur mot de passe avant l\'expiration du lien');

\Illuminate\Support\Facades\Schedule::command('comptes:rappel-mot-de-passe')->hourly()->withoutOverlapping();

// Publication programmée des documents. Chaque minute avec le planificateur, sinon par App\Support\PublicationKicker.
Artisan::command('documents:publier-programmes', function () {
    $this->info(\App\Services\DocumentPublisher::publishDue() . ' document(s) publié(s).');
})->purpose('Publie les documents programmés dont la date de publication est passée');

\Illuminate\Support\Facades\Schedule::command('documents:publier-programmes')->everyMinute()->withoutOverlapping();

// Digest hebdomadaire des membres (nouveautés + reprise de lecture), envoyé le lundi matin.
// Une seule fois par semaine (planificateur ou App\Support\DigestKicker) ; --force pour renvoyer.
Artisan::command('digest:hebdomadaire {--force : Envoie même si le digest de la semaine est déjà parti}', function (\App\Services\WeeklyDigest $digest) {
    $sent = $this->option('force') ? $digest->sendAll() : $digest->sendThisWeekOnce();
    $this->info($sent === null ? 'Digest de cette semaine déjà envoyé (ou avant lundi 8 h).' : $sent . ' digest(s) envoyé(s).');
})->purpose('Envoie le digest hebdomadaire aux membres actifs');

\Illuminate\Support\Facades\Schedule::command('digest:hebdomadaire')
    ->weeklyOn(1, '08:00')
    ->timezone(config('app.display_timezone', 'Indian/Antananarivo'))
    ->withoutOverlapping();
