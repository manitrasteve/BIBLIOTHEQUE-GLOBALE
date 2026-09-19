<?php

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function spaceUser(string $role): User
{
    return User::factory()->create(['role' => $role, 'is_active' => true]);
}

// ---------- Mes lectures ----------

test('mes lectures regroupe les consultations par document et reste personnel', function () {
    $user = spaceUser('etudiant');
    $other = spaceUser('etudiant');
    $doc = Document::factory()->create(['status' => 'publie', 'title' => 'Algorithmique']);
    $otherDoc = Document::factory()->create(['status' => 'publie']);

    Consultation::create(['user_id' => $user->id, 'document_id' => $doc->id, 'consulted_at' => now()->subDay()]);
    Consultation::create(['user_id' => $user->id, 'document_id' => $doc->id, 'consulted_at' => now()]);
    Consultation::create(['user_id' => $other->id, 'document_id' => $otherDoc->id, 'consulted_at' => now()]);

    Sanctum::actingAs($user);
    $data = $this->getJson('/api/mes-lectures')->assertOk()->json('data');

    expect($data)->toHaveCount(1)
        ->and($data[0]['title'])->toBe('Algorithmique')
        ->and($data[0]['views'])->toBe(2)
        ->and($data[0])->toHaveKeys(['slug', 'authors', 'last_consulted_at']);
});

test('mes lectures est vide sans consultation (aucune donnée fictive)', function () {
    Sanctum::actingAs(spaceUser('enseignant'));

    expect($this->getJson('/api/mes-lectures')->assertOk()->json('data'))->toBe([]);
});

// ---------- Mes activités ----------

test('mes activités ne renvoie que les activités réelles de l\'utilisateur', function () {
    $user = spaceUser('chercheur');
    $other = spaceUser('etudiant');
    ActivityLog::record($user->id, 'consultation_document', 'Mon document');
    ActivityLog::record($other->id, 'consultation_document', 'Document d\'un autre');

    Sanctum::actingAs($user);
    $data = $this->getJson('/api/activity-logs')->assertOk()->json('data');

    expect($data)->toHaveCount(1)->and($data[0]['description'])->toBe('Mon document');
});

// ---------- RBAC chercheur ----------

test('les routes de recherche et de veille sont réservées au chercheur', function (string $role) {
    Sanctum::actingAs(spaceUser($role));

    $this->getJson('/api/research/searches')->assertForbidden();
    $this->getJson('/api/research/watch-topics')->assertForbidden();
})->with(['etudiant', 'enseignant', 'bibliothecaire']);

// ---------- Mes recherches ----------

test('le chercheur enregistre, retrouve et supprime ses recherches', function () {
    $researcher = spaceUser('chercheur');
    Sanctum::actingAs($researcher);

    $this->postJson('/api/research/searches', ['query' => 'Intelligence artificielle', 'filters' => ['year' => '2024', 'inconnu' => 'x', 'type' => '']])
        ->assertCreated();
    // Même recherche (casse différente) : pas de doublon.
    $this->postJson('/api/research/searches', ['query' => 'intelligence ARTIFICIELLE', 'filters' => ['year' => '2024']])
        ->assertCreated();

    $rows = $this->getJson('/api/research/searches')->assertOk()->json('data');
    expect($rows)->toHaveCount(1)
        ->and($rows[0]['filters'])->toBe(['year' => '2024']);
    expect(ActivityLog::where('user_id', $researcher->id)->where('action', 'recherche')->count())->toBe(1);

    $this->deleteJson('/api/research/searches/'.$rows[0]['id'])->assertOk();
    expect($this->getJson('/api/research/searches')->json('data'))->toBe([]);
});

test('un chercheur ne peut pas supprimer la recherche d\'un autre', function () {
    $owner = spaceUser('chercheur');
    Sanctum::actingAs($owner);
    $id = $this->postJson('/api/research/searches', ['query' => 'Ma recherche'])->json('id');

    Sanctum::actingAs(spaceUser('chercheur'));
    $this->deleteJson("/api/research/searches/{$id}")->assertNotFound();
});

test('une recherche vide est refusée', function () {
    Sanctum::actingAs(spaceUser('chercheur'));

    $this->postJson('/api/research/searches', ['query' => '   '])->assertStatus(422);
});

// ---------- Veille scientifique ----------

test('le chercheur suit un mot-clé et un domaine, sans doublon', function () {
    Sanctum::actingAs(spaceUser('chercheur'));
    $category = Category::factory()->create();

    $this->postJson('/api/research/watch-topics', ['type' => 'mot_cle', 'term' => 'Climat'])->assertCreated();
    $this->postJson('/api/research/watch-topics', ['type' => 'mot_cle', 'term' => 'climat'])->assertStatus(422);
    $this->postJson('/api/research/watch-topics', ['type' => 'domaine', 'category_id' => $category->id])->assertCreated();
    $this->postJson('/api/research/watch-topics', ['type' => 'domaine'])->assertStatus(422);

    expect($this->getJson('/api/research/watch-topics')->json('data'))->toHaveCount(2);
});

test('la veille compte les documents publiés après le début du suivi', function () {
    Sanctum::actingAs(spaceUser('chercheur'));
    $category = Category::factory()->create();
    Document::factory()->create(['status' => 'publie', 'category_id' => $category->id, 'published_at' => now()->subDays(10)]);

    $id = $this->postJson('/api/research/watch-topics', ['type' => 'domaine', 'category_id' => $category->id])->json('id');

    $topic = $this->getJson('/api/research/watch-topics')->json('data.0');
    expect($topic['total'])->toBe(1)->and($topic['new_count'])->toBe(0);

    $this->travel(1)->hours();
    Document::factory()->create(['status' => 'publie', 'category_id' => $category->id, 'published_at' => now()]);
    Document::factory()->create(['status' => 'brouillon', 'category_id' => $category->id]);

    $topic = $this->getJson('/api/research/watch-topics')->json('data.0');
    expect($topic['total'])->toBe(2)->and($topic['new_count'])->toBe(1);

    $docs = $this->getJson("/api/research/watch-topics/{$id}/documents")->assertOk()->json('data');
    expect($docs)->toHaveCount(2)->and(collect($docs)->where('is_new', true))->toHaveCount(1);

    // Consultés : plus de nouveautés.
    expect($this->getJson('/api/research/watch-topics')->json('data.0.new_count'))->toBe(0);
});

test('un chercheur ne voit ni ne supprime les thèmes d\'un autre', function () {
    Sanctum::actingAs(spaceUser('chercheur'));
    $id = $this->postJson('/api/research/watch-topics', ['type' => 'mot_cle', 'term' => 'Eau'])->json('id');

    Sanctum::actingAs(spaceUser('chercheur'));
    $this->getJson('/api/research/watch-topics')->assertOk()->assertJsonCount(0, 'data');
    $this->deleteJson("/api/research/watch-topics/{$id}")->assertNotFound();
    $this->getJson("/api/research/watch-topics/{$id}/documents")->assertNotFound();
});

// ---------- Filtre auteur du catalogue ----------

test('le catalogue accepte le filtre auteur sans casser la recherche existante', function () {
    Document::factory()->create(['status' => 'publie', 'title' => 'Sans auteur particulier']);

    $this->getJson('/api/documents?author=Inexistant')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/documents?q=auteur')->assertOk()->assertJsonCount(1, 'data');
});
