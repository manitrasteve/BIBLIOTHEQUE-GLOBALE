<?php

// « Avis & Suggestions » et « Signaler un problème » : le type « Autre » est précisé par l'utilisateur.

use App\Models\Feedback;
use App\Models\ProblemReport;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));
});

test('avis « Autre » : le type précisé est obligatoire puis enregistré', function () {
    $base = ['type' => 'autre', 'subject' => 'Sujet', 'message' => 'Message', 'rating' => 4];

    $this->postJson('/api/feedbacks', $base)->assertStatus(422)
        ->assertJsonValidationErrors(['custom_type' => 'Précisez le type d’avis.']);
    $this->postJson('/api/feedbacks', [...$base, 'custom_type' => '   '])->assertStatus(422);

    $this->postJson('/api/feedbacks', [...$base, 'custom_type' => '  Accessibilité  '])->assertCreated();
    expect(Feedback::first()->only(['type', 'custom_type']))->toBe(['type' => 'autre', 'custom_type' => 'Accessibilité']);
});

test('avis d\'un type de la liste : aucun type précisé n\'est conservé', function () {
    $this->postJson('/api/feedbacks', ['type' => 'suggestion', 'custom_type' => 'ignoré', 'subject' => 'S', 'message' => 'M'])->assertCreated();
    expect(Feedback::first()->custom_type)->toBeNull();
});

test('signalement « Autre » : le type précisé est obligatoire puis enregistré', function () {
    $base = ['type' => 'autre', 'subject' => 'Sujet', 'description' => 'Description'];

    $this->postJson('/api/problem-reports', $base)->assertStatus(422)
        ->assertJsonValidationErrors(['custom_type' => 'Précisez le type de problème.']);
    $this->postJson('/api/problem-reports', [...$base, 'custom_type' => str_repeat('x', 101)])->assertStatus(422);

    $this->postJson('/api/problem-reports', [...$base, 'custom_type' => 'Lenteur'])->assertCreated();
    expect(ProblemReport::first()->only(['type', 'custom_type']))->toBe(['type' => 'autre', 'custom_type' => 'Lenteur']);

    $this->postJson('/api/problem-reports', ['type' => 'login', 'custom_type' => 'ignoré', 'subject' => 'S', 'description' => 'D'])->assertCreated();
    expect(ProblemReport::latest('id')->first()->custom_type)->toBeNull();
});

test('l\'administrateur voit le type précisé dans la liste des avis et des signalements', function () {
    $this->postJson('/api/feedbacks', ['type' => 'autre', 'custom_type' => 'Horaires', 'subject' => 'S', 'message' => 'M'])->assertCreated();
    $this->postJson('/api/problem-reports', ['type' => 'autre', 'custom_type' => 'Lenteur', 'subject' => 'S', 'description' => 'D'])->assertCreated();

    $this->app['auth']->forgetGuards();
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->getJson('/api/feedbacks')->assertOk()->assertJsonPath('data.0.custom_type', 'Horaires');
    $this->getJson('/api/problem-reports')->assertOk()->assertJsonPath('data.0.custom_type', 'Lenteur');
});
