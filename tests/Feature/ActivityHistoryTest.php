<?php

use App\Models\ActivityLog;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function historyUser(string $role): User
{
    return User::factory()->create(['role' => $role, 'is_active' => true]);
}

test('l\'administrateur voit l\'historique de tous, paginé, du plus récent au plus ancien', function () {
    $admin = historyUser('administrateur');
    $other = historyUser('etudiant');

    foreach (range(1, 35) as $i) {
        ActivityLog::create(['user_id' => $i % 2 ? $admin->id : $other->id, 'action' => 'connexion', 'description' => "Entrée {$i}", 'created_at' => now()->subMinutes(100 - $i)]);
    }

    Sanctum::actingAs($admin);
    $page1 = $this->getJson('/api/activity-logs')->assertOk();
    $page2 = $this->getJson('/api/activity-logs?page=2')->assertOk();

    expect($page1->json('total'))->toBe(35)->and($page1->json('per_page'))->toBe(30)->and($page1->json('last_page'))->toBe(2)
        ->and($page1->json('data.0.description'))->toBe('Entrée 35')
        ->and($page2->json('data'))->toHaveCount(5)->and($page2->json('data.4.description'))->toBe('Entrée 1');
});

test('le filtre par action ne renvoie que cette action', function () {
    $admin = historyUser('administrateur');
    ActivityLog::record($admin->id, 'connexion', 'a');
    ActivityLog::record($admin->id, 'ajout_favori', 'b');
    ActivityLog::record($admin->id, 'recherche', 'c');

    Sanctum::actingAs($admin);

    foreach (['ajout_favori', 'recherche', 'connexion'] as $action) {
        $actions = collect($this->getJson("/api/activity-logs?action={$action}")->assertOk()->json('data'))->pluck('action')->unique()->all();
        expect($actions)->toBe([$action]);
    }
});

test('les non-administrateurs ne voient jamais l\'historique des autres, même avec un filtre', function (string $role) {
    $user = historyUser($role);
    $admin = historyUser('administrateur');
    ActivityLog::record($user->id, 'connexion', 'Ma connexion');
    ActivityLog::record($admin->id, 'suppression_utilisateur', 'Action admin');

    Sanctum::actingAs($user);

    expect(collect($this->getJson('/api/activity-logs')->assertOk()->json('data'))->pluck('description')->all())->toBe(['Ma connexion']);
    // Filtrer sur l'action d'un autre ne révèle rien : seules ses propres entrées sont renvoyées.
    expect(collect($this->getJson('/api/activity-logs?action=suppression_utilisateur')->assertOk()->json('data'))->pluck('description')->all())->toBe(['Ma connexion']);
})->with(['bibliothecaire', 'etudiant', 'enseignant', 'chercheur']);

test('les vues détaillées (consultations, questions IA, favoris) sont réservées à l\'administrateur et paginées', function () {
    $document = Document::factory()->create(['status' => 'publie']);
    $reader = historyUser('etudiant');
    foreach (range(1, 27) as $i) {
        Consultation::create(['user_id' => $reader->id, 'document_id' => $document->id, 'consulted_at' => now()->subMinutes($i)]);
    }

    foreach (['bibliothecaire', 'etudiant', 'enseignant', 'chercheur'] as $role) {
        Sanctum::actingAs(historyUser($role));
        foreach (['/api/consultations', '/api/ai-queries', '/api/all-favorites'] as $uri) {
            $this->getJson($uri)->assertForbidden();
        }
    }

    Sanctum::actingAs(historyUser('administrateur'));
    $first = $this->getJson('/api/consultations')->assertOk();
    expect($first->json('total'))->toBe(27)->and($first->json('per_page'))->toBe(25)->and($first->json('data'))->toHaveCount(25)
        ->and($first->json('data.0.user.name'))->toBe($reader->name)->and($first->json('data.0.document.title'))->toBe($document->title);
    expect($this->getJson('/api/consultations?page=2')->assertOk()->json('data'))->toHaveCount(2);
    $this->getJson('/api/ai-queries')->assertOk();
    $this->getJson('/api/all-favorites')->assertOk();
});
