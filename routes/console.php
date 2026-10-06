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
