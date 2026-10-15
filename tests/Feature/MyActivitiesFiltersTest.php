<?php

// « Mes activités » : recherche et filtres date / jour de la semaine / heure (heure de Madagascar, UTC+3).

use App\Models\ActivityLog;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['app.display_timezone' => 'Indian/Antananarivo']);
});

function myActivity(User $user, string $action, string $description, string $utc): ActivityLog
{
    return ActivityLog::create(['user_id' => $user->id, 'action' => $action, 'description' => $description, 'created_at' => $utc]);
}

function myActivityDescriptions(string $query = ''): array
{
    return collect(test()->getJson('/api/activity-logs?mine=1' . ($query ? "&{$query}" : ''))->assertOk()->json('data'))
        ->pluck('description')->sort()->values()->all();
}

test('recherche dans la description, le code d\'action ou les libellés résolus par le client', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    myActivity($student, 'consultation_document', 'Algorithmique', '2026-10-01 08:00:00');
    myActivity($student, 'ajout_favori', 'Droit civil', '2026-10-02 08:00:00');
    myActivity($student, 'connexion', 'Connexion à la plateforme', '2026-10-03 08:00:00');
    myActivity(User::factory()->create(), 'ajout_favori', 'Activité d\'un autre', '2026-10-03 09:00:00');
    Sanctum::actingAs($student);

    expect(myActivityDescriptions('search=algo'))->toBe(['Algorithmique'])
        ->and(myActivityDescriptions('search=ajout favori'))->toBe(['Droit civil'])
        // « Document consulté » : libellé affiché, résolu en code par la page.
        ->and(myActivityDescriptions('search=Document consulté&actions[]=consultation_document'))->toBe(['Algorithmique'])
        ->and(myActivityDescriptions('search=introuvable'))->toBe([]);
});

test('filtres date, jour de la semaine et heure, à l\'heure locale', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    myActivity($student, 'connexion', 'Nuit', '2026-10-14 22:30:00');       // jeudi 15/10 01:30 local
    myActivity($student, 'connexion', 'Matin', '2026-10-15 07:00:00');      // jeudi 15/10 10:00 local
    myActivity($student, 'connexion', 'Après-midi', '2026-10-12 13:00:00'); // lundi 12/10 16:00 local
    Sanctum::actingAs($student);

    expect(myActivityDescriptions('date=2026-10-15'))->toBe(['Matin', 'Nuit'])
        ->and(myActivityDescriptions('weekday=1'))->toBe(['Après-midi'])
        ->and(myActivityDescriptions('time_from=09:00&time_to=12:00'))->toBe(['Matin'])
        ->and(myActivityDescriptions('time_from=22:00&time_to=06:00'))->toBe(['Nuit'])
        ->and(myActivityDescriptions('weekday=4&search=mat'))->toBe(['Matin']);

    $this->getJson('/api/activity-logs?mine=1&weekday=4')->assertJsonPath('total', 2);
});

test('l\'administrateur filtre aussi ses propres activités, sans voir celles des autres', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    myActivity($admin, 'publication_document', 'Mon document', '2026-10-15 07:00:00');
    myActivity(User::factory()->create(), 'publication_document', 'Document d\'un autre', '2026-10-15 07:00:00');
    Sanctum::actingAs($admin);

    expect(myActivityDescriptions('date=2026-10-15'))->toBe(['Mon document']);
});

test('des filtres invalides sont refusés proprement (422)', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->getJson('/api/activity-logs?mine=1&date=15/10/2026')->assertStatus(422);
    $this->getJson('/api/activity-logs?mine=1&time_to=7h')->assertStatus(422);
    $this->getJson('/api/activity-logs?mine=1&weekday=0')->assertStatus(422);
    $this->getJson('/api/activity-logs?mine=1&search[]=x')->assertStatus(422);
});
