<?php

// Un bibliothécaire ne peut modifier, réindexer, archiver ou publier QUE les documents de sa propre bibliothèque.
// Règle : permission existante + document de sa bibliothèque = action autorisée. La restriction est vérifiée côté serveur.

use App\Models\ActivityLog;
use App\Models\AppNotification;
use App\Models\Document;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use App\Services\DocumentIngestionService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function ownershipWorld(): object
{
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();

    $a = Library::factory()->create(['name' => 'Bibliothèque A']);
    $b = Library::factory()->create(['name' => 'Bibliothèque B']);
    $librarian = function (Library $lib, array $permissions = []) {
        $u = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $lib->id]);
        foreach ($permissions as $name) {
            $u->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
        }

        return $u;
    };

    return (object) [
        'a' => $a, 'b' => $b,
        'libA' => $librarian($a), 'libB' => $librarian($b),
        'libAPublisher' => $librarian($a, ['publier_document']), // permission OK
        'docA' => Document::factory()->create(['library_id' => $a->id, 'title' => 'Doc A', 'status' => 'publie']),
        'docB' => Document::factory()->create(['library_id' => $b->id, 'title' => 'Doc B', 'status' => 'publie']),
    ];
}

/** Doublure du service d'indexation : compte les appels réels (la réindexation ne doit être lancée que si autorisée). */
function expectIngestions(object $test, int $times): void
{
    $mock = Mockery::mock(DocumentIngestionService::class);
    $times === 0 ? $mock->shouldReceive('ingest')->never() : $mock->shouldReceive('ingest')->times($times);
    app()->instance(DocumentIngestionService::class, $mock);
}

test('scénarios 1 et 3 : chaque bibliothécaire modifie, réindexe et archive les documents de SA bibliothèque', function () {
    $w = ownershipWorld();
    expectIngestions($this, 2); // une réindexation par bibliothèque

    foreach ([[$w->libA, $w->docA], [$w->libB, $w->docB]] as [$librarian, $doc]) {
        Sanctum::actingAs($librarian);

        $this->postJson("/api/documents/{$doc->id}", ['title' => 'Nouveau ' . $doc->title])->assertOk();
        $this->putJson("/api/documents/{$doc->id}", ['title' => 'Encore ' . $doc->title])->assertOk();
        $this->postJson("/api/documents/{$doc->id}/reindex")->assertOk()->assertJson(['message' => 'Indexation RAG relancée.']);
        $this->postJson("/api/documents/{$doc->id}/archive")->assertOk();

        expect($doc->fresh()->status)->toBe('archive')->and($doc->fresh()->title)->toBe('Encore ' . $doc->title);
    }
});

test('scénario 2 : un bibliothécaire ne peut ni modifier, ni réindexer, ni archiver, ni publier un document d\'une autre bibliothèque (403)', function () {
    $w = ownershipWorld();
    expectIngestions($this, 0); // la réindexation n'est JAMAIS lancée
    $w->docB->update(['status' => 'brouillon']);
    $w->docA->update(['status' => 'brouillon']);

    foreach ([[$w->libAPublisher, $w->docB, 'Doc B'], [$w->libB, $w->docA, 'Doc A']] as [$librarian, $foreign, $title]) {
        Sanctum::actingAs($librarian);

        $this->postJson("/api/documents/{$foreign->id}", ['title' => 'Piraté'])->assertForbidden();
        $this->putJson("/api/documents/{$foreign->id}", ['title' => 'Piraté'])->assertForbidden();
        $this->postJson("/api/documents/{$foreign->id}/reindex")->assertForbidden();
        $this->postJson("/api/documents/{$foreign->id}/archive")->assertForbidden();
        $this->postJson("/api/documents/{$foreign->id}/publish")->assertForbidden(); // même avec la permission « publier »
        $this->getJson("/api/documents-manage/{$foreign->id}")->assertForbidden();

        $fresh = $foreign->fresh();
        expect($fresh->title)->toBe($title)->and($fresh->status)->toBe('brouillon')->and($fresh->published_at)->toBeNull();
    }

    // Aucune trace : ni journal d'audit, ni notification, ni fichier écrit.
    expect(ActivityLog::count())->toBe(0)->and(AppNotification::count())->toBe(0);
});

test('une modification refusée n\'écrit aucun fichier et ne relance aucune indexation, même avec un PDF joint', function () {
    $w = ownershipWorld();
    expectIngestions($this, 0);
    Sanctum::actingAs($w->libA);

    $this->post("/api/documents/{$w->docB->id}", [
        'title' => 'Piraté', 'file' => \Illuminate\Http\UploadedFile::fake()->create('x.pdf', 50, 'application/pdf'),
    ], ['Accept' => 'application/json'])->assertForbidden();

    expect(Storage::disk('local')->allFiles())->toBe([])->and($w->docB->fresh()->title)->toBe('Doc B');
});

test('scénario 5 : permission existante ET bibliothèque du document — les deux conditions sont nécessaires pour publier', function () {
    $w = ownershipWorld();
    $w->docA->update(['status' => 'brouillon']);
    $w->docB->update(['status' => 'brouillon']);

    // Sans la permission « publier_document », même sur sa propre bibliothèque : refusé (comportement existant).
    Sanctum::actingAs($w->libA);
    $this->postJson("/api/documents/{$w->docA->id}/publish")->assertForbidden();
    expect($w->docA->fresh()->status)->toBe('brouillon');

    // Permission OK + autre bibliothèque : refusé.
    Sanctum::actingAs($w->libAPublisher);
    $this->postJson("/api/documents/{$w->docB->id}/publish")->assertForbidden();
    expect($w->docB->fresh()->status)->toBe('brouillon');

    // Permission OK + sa bibliothèque : autorisé, le mécanisme existant est conservé (brouillon → publié).
    $this->postJson("/api/documents/{$w->docA->id}/publish")->assertOk();
    expect($w->docA->fresh()->status)->toBe('publie')->and($w->docA->fresh()->published_at)->not->toBeNull();

    // Modifier et archiver ne demandent toujours aucune permission particulière (sur sa bibliothèque).
    Sanctum::actingAs($w->libA);
    $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'Modifié sans permission spéciale'])->assertOk();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertOk();
});

test('scénario 4 : impossible de contourner la restriction en appelant directement l\'API', function () {
    $w = ownershipWorld();
    expectIngestions($this, 0);

    // Sans jeton.
    $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'X'])->assertUnauthorized();
    $this->putJson("/api/documents/{$w->docA->id}", ['title' => 'X'])->assertUnauthorized();
    $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertUnauthorized();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertUnauthorized();

    // Comptes qui ne sont pas du personnel, même rattachés à la bibliothèque du document.
    foreach (['etudiant', 'enseignant', 'chercheur'] as $role) {
        Sanctum::actingAs(User::factory()->create(['role' => $role, 'is_active' => true, 'library_id' => $w->a->id]));
        $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'X'])->assertForbidden();
        $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertForbidden();
        $this->postJson("/api/documents/{$w->docA->id}/archive")->assertForbidden();
        $this->postJson("/api/documents/{$w->docA->id}/publish")->assertForbidden();
    }

    // Un bibliothécaire ne peut pas « déplacer » un de ses documents vers une autre bibliothèque pour contourner le contrôle,
    // ni prétendre appartenir à une autre bibliothèque via la requête.
    Sanctum::actingAs($w->libA);
    $this->postJson("/api/documents/{$w->docA->id}", ['library_id' => $w->b->id])->assertForbidden();
    $this->postJson("/api/documents/{$w->docB->id}", ['title' => 'X', 'library_id' => $w->a->id])->assertForbidden();
    expect($w->docA->fresh()->library_id)->toBe($w->a->id)->and($w->docB->fresh()->library_id)->toBe($w->b->id)->and($w->docB->fresh()->title)->toBe('Doc B');

    // Bibliothécaire sans bibliothèque rattachée : aucun document.
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]));
    $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertForbidden();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertForbidden();
});

test('les droits de l\'administrateur sont inchangés : il gère les documents de toutes les bibliothèques', function () {
    $w = ownershipWorld();
    expectIngestions($this, 2);
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    foreach ([$w->docA, $w->docB] as $doc) {
        $this->postJson("/api/documents/{$doc->id}", ['title' => 'Admin ' . $doc->title])->assertOk();
        $this->postJson("/api/documents/{$doc->id}/reindex")->assertOk();
        $this->postJson("/api/documents/{$doc->id}/archive")->assertOk();
    }
    expect($w->docA->fresh()->status)->toBe('archive')->and($w->docB->fresh()->status)->toBe('archive');
});

test('la liste de gestion du bibliothécaire ne propose que les documents sur lesquels il peut agir', function () {
    $w = ownershipWorld();
    Sanctum::actingAs($w->libA);

    $ids = collect($this->getJson('/api/documents-manage')->assertOk()->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$w->docA->id]);
});
