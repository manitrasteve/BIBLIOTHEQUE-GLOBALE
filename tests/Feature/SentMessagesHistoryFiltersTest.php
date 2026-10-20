<?php

// « Messages » (administrateur, bibliothécaire) : recherche et filtres date / jour / heure
// de l'historique des envois (heure de Madagascar, UTC+3).

use App\Models\AdminMessage;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['app.display_timezone' => 'Indian/Antananarivo']);
});

function sentMessage(User $sender, string $subject, string $utc, string $message = 'Texte'): AdminMessage
{
    test()->travelTo($utc);
    $sent = AdminMessage::create(['sender_id' => $sender->id, 'subject' => $subject, 'message' => $message, 'recipient_count' => 1]);
    test()->travelBack();

    return $sent;
}

function sentSubjects(string $query = ''): array
{
    return collect(test()->getJson('/api/admin-messages' . ($query ? "?{$query}" : ''))->assertOk()->json('data'))
        ->pluck('subject')->sort()->values()->all();
}

test('recherche dans l\'objet et le texte, sans voir les envois des autres ni ceux supprimés', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    sentMessage($admin, 'Fermeture exceptionnelle', '2026-10-01 08:00:00', 'Inventaire annuel');
    sentMessage($admin, 'Nouveaux mémoires', '2026-10-02 08:00:00', 'Agronomie');
    sentMessage($admin, 'Fermeture effacée', '2026-10-03 08:00:00')->update(['deleted_by_sender_at' => now()]);
    sentMessage(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]), 'Fermeture d\'un autre', '2026-10-03 08:00:00');
    Sanctum::actingAs($admin);

    expect(sentSubjects('search=fermeture'))->toBe(['Fermeture exceptionnelle'])
        ->and(sentSubjects('search=inventaire'))->toBe(['Fermeture exceptionnelle'])
        ->and(sentSubjects('search=introuvable'))->toBe([])
        ->and(sentSubjects())->toBe(['Fermeture exceptionnelle', 'Nouveaux mémoires']);
});

test('filtres date, jour de la semaine et heure d\'envoi, à l\'heure locale', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);
    sentMessage($librarian, 'Nuit', '2026-10-14 22:30:00');       // jeudi 15/10 01:30 local
    sentMessage($librarian, 'Matin', '2026-10-15 07:00:00');      // jeudi 15/10 10:00 local
    sentMessage($librarian, 'Après-midi', '2026-10-12 13:00:00'); // lundi 12/10 16:00 local
    Sanctum::actingAs($librarian);

    expect(sentSubjects('date=2026-10-15'))->toBe(['Matin', 'Nuit'])
        ->and(sentSubjects('weekday=1'))->toBe(['Après-midi'])
        ->and(sentSubjects('time_from=09:00&time_to=12:00'))->toBe(['Matin'])
        ->and(sentSubjects('time_from=22:00&time_to=06:00'))->toBe(['Nuit'])
        ->and(sentSubjects('weekday=4&search=mat'))->toBe(['Matin']);

    $this->getJson('/api/admin-messages?weekday=4')->assertJsonPath('total', 2);
});

test('des filtres invalides sont refusés proprement (422)', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->getJson('/api/admin-messages?date=15-10-2026')->assertStatus(422);
    $this->getJson('/api/admin-messages?time_from=25:00')->assertStatus(422);
    $this->getJson('/api/admin-messages?weekday=9')->assertStatus(422);
    $this->getJson('/api/admin-messages?search[]=x')->assertStatus(422);
});
