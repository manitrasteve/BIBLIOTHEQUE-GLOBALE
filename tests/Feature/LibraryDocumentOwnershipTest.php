<?php

// Bibliothèque Numérique Globale : un bibliothécaire peut désormais modifier, réindexer, archiver ou publier
// les documents de N'IMPORTE QUELLE bibliothèque. Seules les permissions RBAC existantes (ex. publier_document)
// continuent de gouverner ce qu'il peut faire — la bibliothèque du document n'est plus une restriction.

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

test('scénario 2 : un bibliothécaire peut désormais modifier, réindexer et archiver un document d\'une autre bibliothèque ; seule la permission gouverne la publication (Bibliothèque Numérique Globale)', function () {
    $w = ownershipWorld();
    expectIngestions($this, 2); // une réindexation par bibliothécaire, sur le document étranger
    $w->docB->update(['status' => 'brouillon']);
    $w->docA->update(['status' => 'brouillon']);

    // libAPublisher (permission publier_document) agit sur docB (bibliothèque B) : tout est autorisé.
    Sanctum::actingAs($w->libAPublisher);
    $this->postJson("/api/documents/{$w->docB->id}", ['title' => 'Modifié par A'])->assertOk();
    $this->postJson("/api/documents/{$w->docB->id}/reindex")->assertOk();
    $this->postJson("/api/documents/{$w->docB->id}/publish")->assertOk();
    $this->postJson("/api/documents/{$w->docB->id}/archive")->assertOk();
    $this->getJson("/api/documents-manage/{$w->docB->id}")->assertOk();

    // libB (sans permission particulière) agit sur docA (bibliothèque A) : tout sauf publier (permission manquante, pas la bibliothèque).
    Sanctum::actingAs($w->libB);
    $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'Modifié par B'])->assertOk();
    $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertOk();
    $this->postJson("/api/documents/{$w->docA->id}/publish")->assertForbidden();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertOk();

    expect($w->docA->fresh()->title)->toBe('Modifié par B')->and($w->docB->fresh()->title)->toBe('Modifié par A');
});

test('une modification autorisée sur un document d\'une autre bibliothèque écrit bien le fichier et relance l\'indexation (Bibliothèque Numérique Globale)', function () {
    $w = ownershipWorld();
    expectIngestions($this, 1);
    Sanctum::actingAs($w->libA);

    $this->post("/api/documents/{$w->docB->id}", [
        'title' => 'Modifié avec fichier', 'file' => \Illuminate\Http\UploadedFile::fake()->create('x.pdf', 50, 'application/pdf'),
    ], ['Accept' => 'application/json'])->assertOk();

    expect(Storage::disk('local')->allFiles())->not->toBe([])->and($w->docB->fresh()->title)->toBe('Modifié avec fichier');
});

test('scénario 5 : seule la permission gouverne désormais la publication, plus la bibliothèque (Bibliothèque Numérique Globale)', function () {
    $w = ownershipWorld();
    $w->docA->update(['status' => 'brouillon']);
    $w->docB->update(['status' => 'brouillon']);

    // Sans la permission « publier_document », même sur sa propre bibliothèque : refusé (comportement existant, inchangé).
    Sanctum::actingAs($w->libA);
    $this->postJson("/api/documents/{$w->docA->id}/publish")->assertForbidden();
    expect($w->docA->fresh()->status)->toBe('brouillon');

    // Permission OK, même sur une autre bibliothèque : autorisé désormais.
    Sanctum::actingAs($w->libAPublisher);
    $this->postJson("/api/documents/{$w->docB->id}/publish")->assertOk();
    expect($w->docB->fresh()->status)->toBe('publie')->and($w->docB->fresh()->published_at)->not->toBeNull();

    // Permission OK + sa propre bibliothèque : toujours autorisé.
    $this->postJson("/api/documents/{$w->docA->id}/publish")->assertOk();
    expect($w->docA->fresh()->status)->toBe('publie');

    // Modifier et archiver ne demandent toujours aucune permission particulière.
    Sanctum::actingAs($w->libA);
    $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'Modifié sans permission spéciale'])->assertOk();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertOk();
});

test('scénario 4 : les rôles non-personnel restent bloqués ; un bibliothécaire peut désormais déplacer un document entre bibliothèques (Bibliothèque Numérique Globale)', function () {
    $w = ownershipWorld();
    expectIngestions($this, 1); // reindex par le bibliothécaire sans bibliothèque, en fin de test

    // Sans jeton.
    $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'X'])->assertUnauthorized();
    $this->putJson("/api/documents/{$w->docA->id}", ['title' => 'X'])->assertUnauthorized();
    $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertUnauthorized();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertUnauthorized();

    // Comptes qui ne sont pas du personnel : toujours bloqués (RBAC, inchangé).
    foreach (['etudiant', 'enseignant', 'chercheur'] as $role) {
        Sanctum::actingAs(User::factory()->create(['role' => $role, 'is_active' => true, 'library_id' => $w->a->id]));
        $this->postJson("/api/documents/{$w->docA->id}", ['title' => 'X'])->assertForbidden();
        $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertForbidden();
        $this->postJson("/api/documents/{$w->docA->id}/archive")->assertForbidden();
        $this->postJson("/api/documents/{$w->docA->id}/publish")->assertForbidden();
    }

    // Un bibliothécaire peut désormais déplacer un document vers une autre bibliothèque.
    Sanctum::actingAs($w->libA);
    $this->postJson("/api/documents/{$w->docA->id}", ['library_id' => $w->b->id])->assertOk();
    expect($w->docA->fresh()->library_id)->toBe($w->b->id);
    $this->postJson("/api/documents/{$w->docB->id}", ['title' => 'Modifié par A', 'library_id' => $w->a->id])->assertOk();
    expect($w->docB->fresh()->library_id)->toBe($w->a->id)->and($w->docB->fresh()->title)->toBe('Modifié par A');

    // Bibliothécaire sans bibliothèque rattachée (compte global) : accède aussi à tous les documents.
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]));
    $this->postJson("/api/documents/{$w->docA->id}/reindex")->assertOk();
    $this->postJson("/api/documents/{$w->docA->id}/archive")->assertOk();
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

test('la liste de gestion du bibliothécaire propose désormais les documents de toutes les bibliothèques (Bibliothèque Numérique Globale)', function () {
    $w = ownershipWorld();
    Sanctum::actingAs($w->libA);

    $ids = collect($this->getJson('/api/documents-manage')->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

    expect($ids)->toBe(collect([$w->docA->id, $w->docB->id])->sort()->values()->all());
});
