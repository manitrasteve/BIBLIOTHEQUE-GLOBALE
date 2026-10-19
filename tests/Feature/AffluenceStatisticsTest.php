<?php

// Carte d'affluence de la page « Statistiques » : consultations et connexions regroupées par jour de la
// semaine et par heure, à l'heure de Madagascar, sur la période et l'établissement choisis.

use App\Models\ActivityLog;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['app.display_timezone' => 'Indian/Antananarivo']);
    // Mardi 20 octobre 2026.
    $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'UTC'));
});

test("l'affluence regroupe les consultations et les connexions par jour et par heure locale", function () {
    $fm = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'school' => 'Faculté de Médecine']);
    $iostm = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'school' => 'IOSTM']);
    $doc = Document::factory()->create();

    // Lundi 5/10 07:00 UTC = lundi 10 h à Madagascar (deux consultations).
    Consultation::create(['user_id' => $fm->id, 'document_id' => $doc->id, 'consulted_at' => '2026-10-05 07:00:00']);
    Consultation::create(['user_id' => $iostm->id, 'document_id' => $doc->id, 'consulted_at' => '2026-10-05 07:40:00']);
    // Lundi 5/10 21:30 UTC = mardi 6/10 0 h 30 à Madagascar : compté le mardi à 0 h.
    Consultation::create(['user_id' => $fm->id, 'document_id' => $doc->id, 'consulted_at' => '2026-10-05 21:30:00']);
    // Hors période (3 derniers mois = depuis août).
    Consultation::create(['user_id' => $fm->id, 'document_id' => $doc->id, 'consulted_at' => '2026-06-01 07:00:00']);

    // Mercredi 7/10 05:15 UTC = mercredi 8 h ; une autre action n'est pas une connexion.
    ActivityLog::create(['user_id' => $fm->id, 'action' => 'connexion', 'description' => 'Connexion', 'created_at' => '2026-10-07 05:15:00']);
    ActivityLog::create(['user_id' => $fm->id, 'action' => 'recherche', 'description' => 'Recherche', 'created_at' => '2026-10-07 05:20:00']);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $r = $this->getJson('/api/dashboard/statistics?months=3')->assertOk();
    $consultations = $r->json('affluence.consultations');
    $connexions = $r->json('affluence.connexions');

    expect($consultations)->toHaveCount(7)
        ->and($consultations[0])->toHaveCount(24)
        ->and($consultations[0][10])->toBe(2)
        ->and($consultations[1][0])->toBe(1)
        ->and(collect($consultations)->flatten()->sum())->toBe(3)
        ->and($connexions[2][8])->toBe(1)
        ->and(collect($connexions)->flatten()->sum())->toBe(1);

    // Filtre par établissement : seules les activités des membres de la FM.
    $fmOnly = $this->getJson('/api/dashboard/statistics?months=3&establishment=FM')->assertOk();
    expect($fmOnly->json('affluence.consultations.0.10'))->toBe(1)
        ->and(collect($fmOnly->json('affluence.consultations'))->flatten()->sum())->toBe(2);
});

test("la période élargie inclut les consultations plus anciennes", function () {
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $doc = Document::factory()->create();
    Consultation::create(['user_id' => $member->id, 'document_id' => $doc->id, 'consulted_at' => '2026-06-01 07:00:00']);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $three = $this->getJson('/api/dashboard/statistics?months=3')->assertOk();
    $twelve = $this->getJson('/api/dashboard/statistics?months=12')->assertOk();

    expect(collect($three->json('affluence.consultations'))->flatten()->sum())->toBe(0)
        ->and(collect($twelve->json('affluence.consultations'))->flatten()->sum())->toBe(1);
});
