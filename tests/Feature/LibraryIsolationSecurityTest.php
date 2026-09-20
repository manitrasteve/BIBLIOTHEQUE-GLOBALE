<?php

use App\Models\AccountRequest;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\Feedback;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

/** Deux bibliothèques, un bibliothécaire par bibliothèque (avec toutes les permissions utiles) et un administrateur. */
function isolationWorld(): object
{
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();

    $a = Library::factory()->create(['name' => 'Centrale']);
    $b = Library::factory()->create(['name' => 'Nord']);
    $mk = function (Library $lib) {
        $u = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $lib->id]);
        foreach (['publier_document', 'supprimer_document', 'voir_corbeille', 'restaurer_corbeille', 'supprimer_definitivement_corbeille', 'modifier_bibliotheque', 'voir_statistiques', 'voir_popularite', 'voir_avis_utilisateurs', 'voir_signalements'] as $name) {
            $u->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
        }

        return $u;
    };

    return (object) [
        'a' => $a, 'b' => $b, 'jean' => $mk($a), 'paul' => $mk($b),
        'admin' => User::factory()->create(['role' => 'administrateur', 'is_active' => true]),
        'mine' => Document::factory()->create(['library_id' => $a->id, 'title' => 'Doc Centrale', 'status' => 'publie']),
        'theirs' => Document::factory()->create(['library_id' => $b->id, 'title' => 'Doc Nord', 'status' => 'publie']),
    ];
}

test('la liste et les totaux de gestion ne montrent que la bibliothèque du bibliothécaire, même avec library_id dans l\'URL', function () {
    $w = isolationWorld();
    Sanctum::actingAs($w->jean);

    foreach (['/api/documents-manage', "/api/documents-manage?library_id={$w->b->id}", '/api/documents-manage?library_id=999'] as $url) {
        $json = $this->getJson($url)->assertOk()->json();
        expect(collect($json['data'])->pluck('title')->all())->toBe(['Doc Centrale'])->and($json['counts']['all'])->toBe(1);
    }

    // L'administrateur, lui, voit tout et peut filtrer.
    Sanctum::actingAs($w->admin);
    expect($this->getJson('/api/documents-manage')->json('counts.all'))->toBe(2)
        ->and($this->getJson("/api/documents-manage?library_id={$w->b->id}")->json('counts.all'))->toBe(1);
});

test('un bibliothécaire ne peut ni lire, ni modifier, ni publier, ni archiver, ni réindexer, ni supprimer un document d\'une autre bibliothèque', function () {
    $w = isolationWorld();
    $w->theirs->update(['status' => 'brouillon']);
    Sanctum::actingAs($w->jean);
    $id = $w->theirs->id;

    $this->getJson("/api/documents-manage/{$id}")->assertForbidden();
    $this->postJson("/api/documents/{$id}", ['title' => 'Piraté'])->assertForbidden();
    $this->putJson("/api/documents/{$id}", ['title' => 'Piraté'])->assertForbidden();
    $this->postJson("/api/documents/{$id}/publish")->assertForbidden();
    $this->postJson("/api/documents/{$id}/archive")->assertForbidden();
    $this->postJson("/api/documents/{$id}/reindex")->assertForbidden();
    $this->deleteJson("/api/documents/{$id}")->assertForbidden();

    $fresh = $w->theirs->fresh();
    expect($fresh->title)->toBe('Doc Nord')->and($fresh->status)->toBe('brouillon')->and($fresh->trashed())->toBeFalse();
    $this->assertDatabaseMissing('activity_logs', ['subject_id' => $id]);

    // Sur sa propre bibliothèque tout fonctionne (publication et suppression : permissions accordées).
    $mine = $w->mine->id;
    $this->getJson("/api/documents-manage/{$mine}")->assertOk();
    $this->postJson("/api/documents/{$mine}", ['title' => 'Mon titre'])->assertOk();
    $this->postJson("/api/documents/{$mine}/archive")->assertOk();
    $this->postJson("/api/documents/{$mine}/publish")->assertOk();
    $this->deleteJson("/api/documents/{$mine}")->assertOk();
});

test('un bibliothécaire ne peut créer ou déplacer un document que dans sa bibliothèque', function () {
    $w = isolationWorld();
    Sanctum::actingAs($w->jean);
    $payload = fn (int $libraryId) => [
        'title' => 'Nouveau', 'type' => 'Livre', 'category' => 'Droit', 'library_id' => $libraryId, 'language' => 'Français',
        'access_level' => 'authentifie', 'file' => UploadedFile::fake()->create('a.pdf', 50, 'application/pdf'),
    ];

    $this->post('/api/documents', $payload($w->b->id), ['Accept' => 'application/json'])->assertForbidden();
    expect(Document::where('title', 'Nouveau')->exists())->toBeFalse();

    $this->post('/api/documents', $payload($w->a->id), ['Accept' => 'application/json'])->assertCreated();

    // Transfert d'un de ses documents vers une autre bibliothèque : refusé.
    $this->postJson("/api/documents/{$w->mine->id}", ['library_id' => $w->b->id])->assertForbidden();
    expect($w->mine->fresh()->library_id)->toBe($w->a->id);

    // L'administrateur peut créer partout et transférer.
    Sanctum::actingAs($w->admin);
    $this->post('/api/documents', $payload($w->b->id), ['Accept' => 'application/json'])->assertCreated();
    $this->postJson("/api/documents/{$w->mine->id}", ['library_id' => $w->b->id])->assertOk();
});

test('un bibliothécaire sans bibliothèque ne voit rien et ne peut rien gérer', function () {
    $w = isolationWorld();
    $orphan = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]);
    Sanctum::actingAs($orphan);

    expect($this->getJson('/api/documents-manage')->assertOk()->json('counts.all'))->toBe(0);
    $this->postJson("/api/documents/{$w->mine->id}/archive")->assertForbidden();
});

test('la corbeille est limitée à la bibliothèque et « vider » ne touche pas les autres bibliothèques', function () {
    $w = isolationWorld();
    $w->mine->delete();
    $w->theirs->delete();
    $studentA = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->a->id]);
    $studentB = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->b->id]);
    $studentA->delete();
    $studentB->delete();
    Sanctum::actingAs($w->jean);

    $trash = $this->getJson('/api/trash')->assertOk()->json();
    expect(collect($trash['documents'])->pluck('title')->all())->toBe(['Doc Centrale'])
        ->and(collect($trash['users'])->pluck('id')->all())->toBe([$studentA->id]);

    // Tentatives sur les éléments de l'autre bibliothèque : introuvables.
    $this->postJson("/api/trash/documents/{$w->theirs->id}/restore")->assertNotFound();
    $this->deleteJson("/api/trash/documents/{$w->theirs->id}")->assertNotFound();
    $this->postJson("/api/trash/users/{$studentB->id}/restore")->assertNotFound();
    $this->deleteJson("/api/trash/users/{$studentB->id}")->assertNotFound();

    // Vider la corbeille : uniquement la sienne.
    $this->deleteJson('/api/trash')->assertOk();
    expect(Document::onlyTrashed()->pluck('title')->all())->toBe(['Doc Nord'])
        ->and(User::onlyTrashed()->pluck('id')->all())->toBe([$studentB->id]);

    // L'administrateur voit et vide tout.
    Sanctum::actingAs($w->admin);
    expect($this->getJson('/api/trash')->json('documents'))->toHaveCount(1);
    $this->deleteJson('/api/trash')->assertOk();
    expect(Document::onlyTrashed()->count())->toBe(0);
});

test('les demandes de compte sont limitées à la bibliothèque et ne peuvent pas être traitées ailleurs', function () {
    $w = isolationWorld();
    $mine = AccountRequest::factory()->create(['library_id' => $w->a->id, 'status' => 'en_attente']);
    $theirs = AccountRequest::factory()->create(['library_id' => $w->b->id, 'status' => 'en_attente']);
    Sanctum::actingAs($w->jean);

    expect(collect($this->getJson('/api/account-requests')->assertOk()->json('data'))->pluck('id')->all())->toBe([$mine->id]);

    $this->postJson("/api/account-requests/{$theirs->id}/verify")->assertForbidden();
    $this->postJson("/api/account-requests/{$theirs->id}/reject", ['reason' => 'x'])->assertForbidden();
    $this->postJson("/api/account-requests/{$theirs->id}/create-account", ['email' => 'x@example.com', 'role' => 'etudiant', 'password' => 'password123'])->assertForbidden();
    $this->postJson("/api/account-requests/{$theirs->id}/validate")->assertForbidden();
    expect($theirs->fresh()->status)->toBe('en_attente');

    // Sa propre demande : pas de blocage par le périmètre.
    $this->postJson("/api/account-requests/{$mine->id}/verify")->assertOk();

    // L'administrateur voit toutes les demandes.
    Sanctum::actingAs($w->admin);
    expect($this->getJson('/api/account-requests')->json('total'))->toBe(2);
});

test('un bibliothécaire ne modifie que sa propre bibliothèque', function () {
    $w = isolationWorld();
    Sanctum::actingAs($w->jean);

    $this->putJson("/api/libraries/{$w->b->id}", ['name' => 'Piratée'])->assertForbidden();
    $this->postJson("/api/libraries/{$w->b->id}", ['name' => 'Piratée'])->assertForbidden();
    expect($w->b->fresh()->name)->toBe('Nord');

    $this->putJson("/api/libraries/{$w->a->id}", ['name' => 'Centrale 2'])->assertOk();
    expect($w->a->fresh()->name)->toBe('Centrale 2');
});

test('les statistiques du bibliothécaire ne portent que sur sa bibliothèque', function () {
    $w = isolationWorld();
    $studentA = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->a->id]);
    User::factory()->count(3)->create(['role' => 'etudiant', 'library_id' => $w->b->id]);
    Consultation::create(['user_id' => $studentA->id, 'document_id' => $w->mine->id, 'consulted_at' => now()]);
    Consultation::create(['user_id' => $studentA->id, 'document_id' => $w->theirs->id, 'consulted_at' => now()]);
    Consultation::create(['user_id' => $studentA->id, 'document_id' => $w->theirs->id, 'consulted_at' => now()]);
    AccountRequest::factory()->create(['library_id' => $w->b->id, 'status' => 'en_attente']);

    Sanctum::actingAs($w->jean);
    $stats = $this->getJson('/api/dashboard/admin')->assertOk()->json();
    expect($stats['total_documents'])->toBe(1)->and($stats['total_consultations'])->toBe(1)->and($stats['pending_account_requests'])->toBe(0)
        ->and($stats['total_users'])->toBe(2); // jean + l'étudiant de sa bibliothèque

    $popularity = $this->getJson('/api/engagement-stats')->assertOk()->json();
    expect(collect($popularity['documents'])->pluck('title')->all())->toBe(['Doc Centrale'])->and($popularity['totals']['consultations'])->toBe(1);

    Sanctum::actingAs($w->admin);
    $all = $this->getJson('/api/dashboard/admin')->json();
    expect($all['total_documents'])->toBe(2)->and($all['total_consultations'])->toBe(3)->and($all['pending_account_requests'])->toBe(1);
});

test('les avis sont limités aux membres de la bibliothèque du bibliothécaire', function () {
    $w = isolationWorld();
    $studentA = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->a->id]);
    $studentB = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->b->id]);
    foreach ([$studentA, $studentB] as $s) {
        Feedback::create(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => $s->id, 'type' => 'suggestion', 'subject' => 'Avis de ' . $s->library_id, 'message' => 'Bonjour', 'rating' => 5, 'status' => 'nouveau']);
    }

    Sanctum::actingAs($w->jean);
    expect(collect($this->getJson('/api/feedbacks')->assertOk()->json('data'))->pluck('user_id')->all())->toBe([$studentA->id]);

    Sanctum::actingAs($w->admin);
    expect($this->getJson('/api/feedbacks')->json('total'))->toBe(2);
});

test('les routes réservées à l\'administrateur restent fermées au bibliothécaire, et sans jeton tout est refusé', function () {
    $w = isolationWorld();

    foreach (['/api/documents-manage', '/api/trash', '/api/account-requests', '/api/dashboard/admin', '/api/users', '/api/consultations'] as $url) {
        $this->getJson($url)->assertUnauthorized();
    }

    Sanctum::actingAs($w->jean);
    foreach (['/api/users', '/api/librarians', '/api/permissions', '/api/consultations', '/api/ai-queries', '/api/all-favorites'] as $url) {
        $this->getJson($url)->assertForbidden();
    }
    $this->deleteJson("/api/libraries/{$w->a->id}")->assertForbidden();
    $this->postJson('/api/assistant/admin', ['question' => 'x'])->assertForbidden();

    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $w->a->id]));
    foreach (['/api/documents-manage', '/api/trash', '/api/account-requests', '/api/dashboard/admin'] as $url) {
        $this->getJson($url)->assertForbidden();
    }
});
