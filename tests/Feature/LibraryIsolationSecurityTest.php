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

test('la liste et les totaux de gestion sont désormais globaux pour le bibliothécaire, avec filtre possible par bibliothèque (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    Sanctum::actingAs($w->jean);

    $json = $this->getJson('/api/documents-manage')->assertOk()->json();
    expect(collect($json['data'])->pluck('title')->sort()->values()->all())->toBe(['Doc Centrale', 'Doc Nord'])->and($json['counts']['all'])->toBe(2);

    // Il peut filtrer sur une bibliothèque précise, comme l'administrateur.
    $filtered = $this->getJson("/api/documents-manage?library_id={$w->b->id}")->assertOk()->json();
    expect(collect($filtered['data'])->pluck('title')->all())->toBe(['Doc Nord'])->and($filtered['counts']['all'])->toBe(1);

    expect($this->getJson('/api/documents-manage?library_id=999')->assertOk()->json('data'))->toBeEmpty();

    // L'administrateur : comportement inchangé.
    Sanctum::actingAs($w->admin);
    expect($this->getJson('/api/documents-manage')->json('counts.all'))->toBe(2)
        ->and($this->getJson("/api/documents-manage?library_id={$w->b->id}")->json('counts.all'))->toBe(1);
});

test('un bibliothécaire peut désormais lire, modifier, publier, archiver, réindexer et supprimer un document d\'une autre bibliothèque (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    $w->theirs->update(['status' => 'brouillon']);
    Sanctum::actingAs($w->jean);
    $id = $w->theirs->id;

    $this->getJson("/api/documents-manage/{$id}")->assertOk();
    $this->postJson("/api/documents/{$id}", ['title' => 'Titre modifié'])->assertOk();
    $this->postJson("/api/documents/{$id}/publish")->assertOk();
    $this->postJson("/api/documents/{$id}/archive")->assertOk();
    $this->postJson("/api/documents/{$id}/reindex")->assertOk();
    $this->deleteJson("/api/documents/{$id}")->assertOk();

    expect($w->theirs->fresh()->trashed())->toBeTrue();
    $this->assertDatabaseHas('activity_logs', ['subject_id' => $id, 'action' => 'suppression_document']);

    // Sa propre bibliothèque continue de fonctionner normalement.
    $mine = $w->mine->id;
    $this->getJson("/api/documents-manage/{$mine}")->assertOk();
    $this->postJson("/api/documents/{$mine}", ['title' => 'Mon titre'])->assertOk();
    $this->postJson("/api/documents/{$mine}/archive")->assertOk();
    $this->postJson("/api/documents/{$mine}/publish")->assertOk();
    $this->deleteJson("/api/documents/{$mine}")->assertOk();
});

test('un bibliothécaire peut désormais créer et déplacer un document vers n\'importe quelle bibliothèque (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    Sanctum::actingAs($w->jean);
    $payload = fn (int $libraryId) => [
        'title' => 'Nouveau', 'type' => 'Livre', 'category' => 'Droit', 'library_id' => $libraryId, 'language' => 'Français',
        'access_level' => 'authentifie', 'file' => UploadedFile::fake()->create('a.pdf', 50, 'application/pdf'),
    ];

    $this->post('/api/documents', $payload($w->b->id), ['Accept' => 'application/json'])->assertCreated();
    expect(Document::where('title', 'Nouveau')->exists())->toBeTrue();

    // Transfert d'un de ses documents vers une autre bibliothèque : autorisé.
    $this->postJson("/api/documents/{$w->mine->id}", ['library_id' => $w->b->id])->assertOk();
    expect($w->mine->fresh()->library_id)->toBe($w->b->id);

    // L'administrateur : comportement inchangé (peut créer partout).
    Sanctum::actingAs($w->admin);
    $this->post('/api/documents', $payload($w->a->id), ['Accept' => 'application/json'])->assertCreated();
});

test('un bibliothécaire sans bibliothèque (compte global) voit toutes les bibliothèques comme n\'importe quel bibliothécaire', function () {
    $w = isolationWorld();
    $orphan = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]);
    Sanctum::actingAs($orphan);

    // Bibliothèque Numérique Globale : l'absence de library_id ne bloque plus rien.
    expect($this->getJson('/api/documents-manage')->assertOk()->json('counts.all'))->toBe(2);
    // Ce compte minimal n'a reçu aucune permission « publier_document » : refusé pour cette raison, pas pour la bibliothèque.
    $this->postJson("/api/documents/{$w->mine->id}/publish")->assertForbidden();
});

test('la corbeille est désormais globale pour le bibliothécaire (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    $w->mine->delete();
    $w->theirs->delete();
    $studentA = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->a->id]);
    $studentB = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->b->id]);
    $studentA->delete();
    $studentB->delete();
    Sanctum::actingAs($w->jean);

    $trash = $this->getJson('/api/trash')->assertOk()->json();
    expect(collect($trash['documents'])->pluck('title')->sort()->values()->all())->toBe(['Doc Centrale', 'Doc Nord'])
        ->and(collect($trash['users'])->pluck('id')->sort()->values()->all())->toBe(collect([$studentA->id, $studentB->id])->sort()->values()->all());

    // Les éléments de l'autre bibliothèque sont désormais accessibles.
    $this->postJson("/api/trash/documents/{$w->theirs->id}/restore")->assertOk();
    $this->postJson("/api/trash/users/{$studentB->id}/restore")->assertOk();

    // Vider la corbeille : tout, toutes bibliothèques confondues.
    $this->deleteJson('/api/trash')->assertOk();
    expect(Document::onlyTrashed()->count())->toBe(0)->and(User::onlyTrashed()->count())->toBe(0);
});

test('les demandes de compte sont désormais globales pour le bibliothécaire (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    $mine = AccountRequest::factory()->create(['library_id' => $w->a->id, 'status' => 'en_attente']);
    $theirs = AccountRequest::factory()->create(['library_id' => $w->b->id, 'status' => 'en_attente']);
    Sanctum::actingAs($w->jean);

    expect(collect($this->getJson('/api/account-requests')->assertOk()->json('data'))->pluck('id')->sort()->values()->all())
        ->toBe(collect([$mine->id, $theirs->id])->sort()->values()->all());

    $this->postJson("/api/account-requests/{$theirs->id}/verify")->assertOk();
    expect($theirs->fresh()->status)->toBe('verifiee');

    $this->postJson("/api/account-requests/{$mine->id}/verify")->assertOk();

    // L'administrateur : comportement inchangé.
    Sanctum::actingAs($w->admin);
    expect($this->getJson('/api/account-requests')->json('total'))->toBe(2);
});

test('un bibliothécaire peut désormais modifier n\'importe quelle bibliothèque, tant qu\'il a la permission (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    Sanctum::actingAs($w->jean);

    $this->putJson("/api/libraries/{$w->b->id}", ['name' => 'Nord modifiée'])->assertOk();
    expect($w->b->fresh()->name)->toBe('Nord modifiée');

    $this->putJson("/api/libraries/{$w->a->id}", ['name' => 'Centrale 2'])->assertOk();
    expect($w->a->fresh()->name)->toBe('Centrale 2');
});

test('les statistiques du bibliothécaire portent désormais sur toutes les bibliothèques (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    $studentA = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->a->id]);
    User::factory()->count(3)->create(['role' => 'etudiant', 'library_id' => $w->b->id]);
    Consultation::create(['user_id' => $studentA->id, 'document_id' => $w->mine->id, 'consulted_at' => now()]);
    Consultation::create(['user_id' => $studentA->id, 'document_id' => $w->theirs->id, 'consulted_at' => now()]);
    Consultation::create(['user_id' => $studentA->id, 'document_id' => $w->theirs->id, 'consulted_at' => now()]);
    AccountRequest::factory()->create(['library_id' => $w->b->id, 'status' => 'en_attente']);

    Sanctum::actingAs($w->jean);
    $stats = $this->getJson('/api/dashboard/admin')->assertOk()->json();
    expect($stats['total_documents'])->toBe(2)->and($stats['total_consultations'])->toBe(3)->and($stats['pending_account_requests'])->toBe(1);

    $popularity = $this->getJson('/api/engagement-stats')->assertOk()->json();
    expect(collect($popularity['documents'])->pluck('title')->sort()->values()->all())->toBe(['Doc Centrale', 'Doc Nord'])->and($popularity['totals']['consultations'])->toBe(3);

    // L'administrateur : mêmes chiffres, comportement inchangé.
    Sanctum::actingAs($w->admin);
    $all = $this->getJson('/api/dashboard/admin')->json();
    expect($all['total_documents'])->toBe(2)->and($all['total_consultations'])->toBe(3)->and($all['pending_account_requests'])->toBe(1);
});

test('les avis sont désormais visibles par tout bibliothécaire, toutes bibliothèques confondues (Bibliothèque Numérique Globale)', function () {
    $w = isolationWorld();
    $studentA = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->a->id]);
    $studentB = User::factory()->create(['role' => 'etudiant', 'library_id' => $w->b->id]);
    foreach ([$studentA, $studentB] as $s) {
        Feedback::create(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => $s->id, 'type' => 'suggestion', 'subject' => 'Avis de ' . $s->library_id, 'message' => 'Bonjour', 'rating' => 5, 'status' => 'nouveau']);
    }

    Sanctum::actingAs($w->jean);
    expect($this->getJson('/api/feedbacks')->assertOk()->json('total'))->toBe(2);

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
