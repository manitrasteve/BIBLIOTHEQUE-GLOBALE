<?php

// « Notifications » : recherche et filtres date / jour de la semaine / heure (heure de Madagascar, UTC+3).

use App\Models\AppNotification;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['app.display_timezone' => 'Indian/Antananarivo']);
});

function myNotification(User $user, string $title, string $utc, ?string $message = null, string $type = 'info'): AppNotification
{
    test()->travelTo($utc);
    $notification = AppNotification::create(['user_id' => $user->id, 'type' => $type, 'title' => $title, 'message' => $message]);
    test()->travelBack();

    return $notification;
}

function myNotificationTitles(string $query = ''): array
{
    return collect(test()->getJson('/api/notifications' . ($query ? "?{$query}" : ''))->assertOk()->json('data'))
        ->pluck('title')->sort()->values()->all();
}

test('recherche dans le titre et le texte, sans voir les notifications des autres', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    myNotification($student, 'Nouvelle lecture recommandée', '2026-10-01 08:00:00', 'Algorithmique', 'lecture_recommandee');
    myNotification($student, 'Compte validé', '2026-10-02 08:00:00', 'Bienvenue');
    myNotification(User::factory()->create(), 'Lecture d\'un autre', '2026-10-03 08:00:00');
    Sanctum::actingAs($student);

    expect(myNotificationTitles('search=lecture'))->toBe(['Nouvelle lecture recommandée'])
        ->and(myNotificationTitles('search=algorithmique'))->toBe(['Nouvelle lecture recommandée'])
        ->and(myNotificationTitles('search=introuvable'))->toBe([]);

    // Les liens restent calculés sur les résultats filtrés.
    $this->getJson('/api/notifications?search=lecture')->assertJsonPath('data.0.related_url', '/lectures-recommandees');
});

test('filtres date, jour de la semaine et heure, à l\'heure locale', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    myNotification($student, 'Nuit', '2026-10-14 22:30:00');       // jeudi 15/10 01:30 local
    myNotification($student, 'Matin', '2026-10-15 07:00:00');      // jeudi 15/10 10:00 local
    myNotification($student, 'Après-midi', '2026-10-12 13:00:00'); // lundi 12/10 16:00 local
    Sanctum::actingAs($student);

    expect(myNotificationTitles('date=2026-10-15'))->toBe(['Matin', 'Nuit'])
        ->and(myNotificationTitles('weekday=1'))->toBe(['Après-midi'])
        ->and(myNotificationTitles('time_from=09:00&time_to=12:00'))->toBe(['Matin'])
        ->and(myNotificationTitles('time_from=22:00&time_to=06:00'))->toBe(['Nuit'])
        ->and(myNotificationTitles('weekday=4&search=mat'))->toBe(['Matin']);

    $this->getJson('/api/notifications?weekday=4')->assertJsonPath('total', 2);
});

test('des filtres invalides sont refusés proprement (422)', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->getJson('/api/notifications?date=15/10/2026')->assertStatus(422);
    $this->getJson('/api/notifications?time_from=99:00')->assertStatus(422);
    $this->getJson('/api/notifications?weekday=8')->assertStatus(422);
    $this->getJson('/api/notifications?search[]=x')->assertStatus(422);
});
