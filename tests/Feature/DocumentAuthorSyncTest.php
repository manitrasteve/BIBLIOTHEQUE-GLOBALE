<?php

// Le formulaire d'édition renvoie toujours la liste complète des auteurs cochés.
// Quand elle est vidée, FormData n'envoie aucune entrée "author_ids[]" (la clé
// est absente de la requête) : la synchronisation ne doit pas s'appuyer sur la
// présence de la clé, sous peine de garder silencieusement les anciens auteurs.

use App\Models\Author;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();
});

test('retirer tous les auteurs à la modification les détache bien (author_ids absent de la requête)', function () {
    $library = Library::factory()->create();
    $author = Author::factory()->create();
    $document = Document::factory()->create(['library_id' => $library->id]);
    $document->authors()->sync([$author->id]);

    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Sanctum::actingAs($admin);

    // Comme le ferait le formulaire avec une liste d'auteurs vidée : aucune
    // clé "author_ids" du tout dans la requête.
    $this->post("/api/documents/{$document->id}", [
        'title' => $document->title,
        'type' => $document->type,
        'category' => $document->category->name ?? 'Informatique',
        'library_id' => $library->id,
        'language' => $document->language,
    ], ['Accept' => 'application/json'])->assertOk();

    expect($document->fresh()->authors()->count())->toBe(0);
});

test('renvoyer une liste d\'auteurs à la modification synchronise toujours vers cette liste', function () {
    $library = Library::factory()->create();
    $oldAuthor = Author::factory()->create();
    $newAuthor = Author::factory()->create();
    $document = Document::factory()->create(['library_id' => $library->id]);
    $document->authors()->sync([$oldAuthor->id]);

    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Sanctum::actingAs($admin);

    $this->post("/api/documents/{$document->id}", [
        'title' => $document->title,
        'type' => $document->type,
        'category' => $document->category->name ?? 'Informatique',
        'library_id' => $library->id,
        'language' => $document->language,
        'author_ids' => [$newAuthor->id],
    ], ['Accept' => 'application/json'])->assertOk();

    expect($document->fresh()->authors()->pluck('authors.id')->all())->toBe([$newAuthor->id]);
});

test('une modification JSON partielle sans author_ids conserve les auteurs', function () {
    $author = Author::factory()->create();
    $document = Document::factory()->create(['library_id' => Library::factory()->create()->id, 'access_level' => 'public']);
    $document->authors()->sync([$author->id]);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->putJson("/api/documents/{$document->id}", ['access_level' => 'restreint'])->assertOk();

    expect($document->fresh()->access_level)->toBe('restreint')
        ->and($document->authors()->pluck('authors.id')->all())->toBe([$author->id]);
});
