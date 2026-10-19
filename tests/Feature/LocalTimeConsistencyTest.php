<?php

// Dates des consultations et tableau de bord des membres : enregistrement en UTC (comme toutes les autres
// dates) et découpage des jours / mois à l'heure de Madagascar.

use App\Models\AiQuery;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['app.display_timezone' => 'Indian/Antananarivo']);
});

test("une consultation est datée par l'application, en UTC", function () {
    // Date figée : la valeur par défaut de la base (horloge réelle) ne peut pas lui correspondre.
    $this->travelTo(Carbon::parse('2026-03-01 08:15:00', 'UTC'));
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $document = Document::factory()->create();

    $consultation = Consultation::create(['user_id' => $member->id, 'document_id' => $document->id]);

    expect($consultation->fresh()->getRawOriginal('consulted_at'))->toStartWith('2026-03-01 08:15:00');
});

test("le tableau de bord d'un membre compte les jours et les mois à l'heure de Madagascar", function () {
    // Jeudi 1er octobre 2026, 01:00 à Madagascar (30 septembre 22:00 UTC).
    $this->travelTo(Carbon::parse('2026-09-30 22:00:00', 'UTC'));
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $document = Document::factory()->create();

    // 30/09 21:30 UTC = 1er octobre 00:30 à Madagascar : aujourd'hui, et dans le mois d'octobre.
    Consultation::create(['user_id' => $member->id, 'document_id' => $document->id, 'consulted_at' => '2026-09-30 21:30:00']);
    // 30/09 20:00 UTC = 30 septembre 23:00 à Madagascar : la veille, mois précédent.
    Consultation::create(['user_id' => $member->id, 'document_id' => $document->id, 'consulted_at' => '2026-09-30 20:00:00']);
    $this->travelTo(Carbon::parse('2026-09-30 21:45:00', 'UTC'));
    AiQuery::create(['user_id' => $member->id, 'document_id' => $document->id, 'question' => 'Q ?', 'answer' => 'R.']);
    $this->travelTo(Carbon::parse('2026-09-30 22:00:00', 'UTC'));

    Sanctum::actingAs($member);
    $r = $this->getJson('/api/dashboard/me')->assertOk();

    $activity = collect($r->json('activity'))->pluck('consultations', 'date');
    expect($r->json('today_consultations'))->toBe(1)
        ->and($r->json('today_ai_queries'))->toBe(1)
        ->and($r->json('month_consultations'))->toBe(1)
        ->and($activity->keys()->last())->toBe('2026-10-01')
        ->and($activity['2026-10-01'])->toBe(1)
        ->and($activity['2026-09-30'])->toBe(1);
});

test('« Mes lectures » renvoie la dernière consultation en ISO UTC', function () {
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $document = Document::factory()->create(['status' => 'publie']);
    Consultation::create(['user_id' => $member->id, 'document_id' => $document->id, 'consulted_at' => '2026-10-04 22:30:00']);

    Sanctum::actingAs($member);
    $date = $this->getJson('/api/mes-lectures')->assertOk()->json('data.0.last_consulted_at');

    // Avec le fuseau : le navigateur l'affiche le 5 octobre à 01:30 (heure de Madagascar).
    expect(Carbon::parse($date)->equalTo(Carbon::parse('2026-10-04 22:30:00', 'UTC')))->toBeTrue()
        ->and($date)->toMatch('/(Z|[+-]\d\d:\d\d)$/');
});
