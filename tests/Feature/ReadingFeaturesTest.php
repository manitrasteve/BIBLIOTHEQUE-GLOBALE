<?php

// Améliorations lecture / recherche : suggestions, recherche « Tout », reprise de lecture,
// notes personnelles par page et documents similaires.

use App\Models\Author;
use App\Models\Category;
use App\Models\Document;
use App\Models\DocumentNote;
use App\Models\Library;
use App\Models\ReadingProgress;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function publishedDoc(array $attributes = []): Document
{
    return Document::factory()->create([
        'status' => 'publie',
        'published_at' => now(),
        'access_level' => 'authentifie',
        ...$attributes,
    ]);
}

// ---------- Recherche ----------

test('les suggestions renvoient les titres publiés et les auteurs, jamais les brouillons', function () {
    $author = Author::factory()->create(['name' => 'Rakoto Economiste']);
    publishedDoc(['title' => 'Économie de Madagascar'])->authors()->attach($author);
    publishedDoc(['title' => 'Histoire économique']);
    Document::factory()->create(['title' => 'Économie brouillon', 'status' => 'brouillon']);

    $response = $this->getJson('/api/documents/suggestions?q=conom')->assertOk();

    expect(collect($response->json('documents'))->pluck('title')->all())
        ->toContain('Économie de Madagascar', 'Histoire économique')
        ->not->toContain('Économie brouillon')
        ->and($response->json('authors'))->toBe(['Rakoto Economiste']);
});

test('les suggestions ne cherchent rien en dessous de deux caractères', function () {
    publishedDoc(['title' => 'Algèbre']);

    $this->getJson('/api/documents/suggestions?q=a')
        ->assertOk()
        ->assertExactJson(['documents' => [], 'authors' => []]);
});

test('la recherche « Tout » (sans by) couvre titre, mots-clés et auteurs', function () {
    $author = Author::factory()->create(['name' => 'Ravelo Botaniste']);
    publishedDoc(['title' => 'Flore endémique'])->authors()->attach($author);
    publishedDoc(['title' => 'Autre sujet', 'keywords' => 'botaniste, plantes']);
    publishedDoc(['title' => 'Sans rapport']);

    foreach (['/api/documents?q=botaniste', '/api/documents?q=botaniste&by=all'] as $url) {
        $titles = collect($this->getJson($url)->assertOk()->json('data'))->pluck('title');
        expect($titles->sort()->values()->all())->toBe(['Autre sujet', 'Flore endémique']);
    }
});

// ---------- Reprise de lecture ----------

test('la dernière page lue est enregistrée puis renvoyée dans la fiche et dans « Mes lectures »', function () {
    $user = User::factory()->create();
    $doc = publishedDoc();
    \App\Models\Consultation::create(['user_id' => $user->id, 'document_id' => $doc->id]);
    Sanctum::actingAs($user);

    $this->putJson("/api/documents/{$doc->slug}/progress", ['page' => 12, 'total_pages' => 80])->assertOk();
    $this->putJson("/api/documents/{$doc->slug}/progress", ['page' => 24, 'total_pages' => 80])->assertOk();

    expect(ReadingProgress::where('user_id', $user->id)->count())->toBe(1);

    $this->withToken($user->createToken('t')->plainTextToken)
        ->getJson("/api/documents/{$doc->slug}")
        ->assertJsonPath('reading_progress.last_page', 24)
        ->assertJsonPath('reading_progress.total_pages', 80);

    $this->getJson('/api/mes-lectures')
        ->assertJsonPath('data.0.last_page', 24)
        ->assertJsonPath('data.0.total_pages', 80);
});

test("la progression d'un document restreint d'une autre bibliothèque est refusée", function () {
    $user = User::factory()->create(['library_id' => Library::factory()]);
    $doc = publishedDoc(['access_level' => 'restreint']);
    Sanctum::actingAs($user);

    $this->putJson("/api/documents/{$doc->slug}/progress", ['page' => 3])->assertForbidden();
    $this->getJson("/api/documents/{$doc->slug}/notes")->assertForbidden();
});

test('un visiteur ne reçoit aucune progression de lecture', function () {
    $doc = publishedDoc();

    $this->getJson("/api/documents/{$doc->slug}")->assertOk()->assertJsonPath('reading_progress', null);
    $this->putJson("/api/documents/{$doc->slug}/progress", ['page' => 3])->assertUnauthorized();
});

// ---------- Notes ----------

test('le lecteur crée, modifie, liste et supprime ses notes par page', function () {
    $user = User::factory()->create();
    $doc = publishedDoc();
    Sanctum::actingAs($user);

    $id = $this->postJson("/api/documents/{$doc->slug}/notes", ['page' => 5, 'body' => 'Idée clé', 'color' => 'vert'])
        ->assertCreated()
        ->json('id');
    $this->postJson("/api/documents/{$doc->slug}/notes", ['page' => 2, 'body' => 'Définition'])->assertCreated();

    // Triées par page.
    expect(collect($this->getJson("/api/documents/{$doc->slug}/notes")->json())->pluck('page')->all())->toBe([2, 5]);

    $this->putJson("/api/notes/{$id}", ['body' => 'Idée clé révisée'])->assertOk()->assertJsonPath('body', 'Idée clé révisée');
    $this->deleteJson("/api/notes/{$id}")->assertOk();

    expect(DocumentNote::count())->toBe(1);
});

test("les notes d'un lecteur restent invisibles et intouchables pour un autre", function () {
    $owner = User::factory()->create();
    $doc = publishedDoc();
    $note = DocumentNote::create(['user_id' => $owner->id, 'document_id' => $doc->id, 'page' => 1, 'body' => 'Privée']);

    Sanctum::actingAs(User::factory()->create());

    expect($this->getJson("/api/documents/{$doc->slug}/notes")->assertOk()->json())->toBe([]);
    $this->putJson("/api/notes/{$note->id}", ['body' => 'Piratée'])->assertNotFound();
    $this->deleteJson("/api/notes/{$note->id}")->assertNotFound();

    expect($note->fresh()->body)->toBe('Privée');
});

test('une note vide ou de couleur inconnue est refusée', function () {
    Sanctum::actingAs(User::factory()->create());
    $doc = publishedDoc();

    $this->postJson("/api/documents/{$doc->slug}/notes", ['page' => 1, 'body' => ''])->assertUnprocessable();
    $this->postJson("/api/documents/{$doc->slug}/notes", ['page' => 1, 'body' => 'x', 'color' => 'violet'])->assertUnprocessable();
});

// ---------- Profil lecteur ----------

test('le profil lecteur compte uniquement les lectures réelles de l’utilisateur', function () {
    $user = User::factory()->create();
    $droit = Category::factory()->create(['name' => 'Droit']);
    $eco = Category::factory()->create(['name' => 'Économie']);
    $d1 = publishedDoc(['category_id' => $droit->id]);
    $d2 = publishedDoc(['category_id' => $droit->id]);
    $d3 = publishedDoc(['category_id' => $eco->id]);

    foreach ([$d1, $d1, $d2, $d3] as $doc) {
        \App\Models\Consultation::create(['user_id' => $user->id, 'document_id' => $doc->id]);
    }
    // Lecture d'un autre utilisateur : jamais comptée.
    \App\Models\Consultation::create(['user_id' => User::factory()->create()->id, 'document_id' => $d3->id]);
    ReadingProgress::create(['user_id' => $user->id, 'document_id' => $d1->id, 'last_page' => 10]);
    ReadingProgress::create(['user_id' => $user->id, 'document_id' => $d2->id, 'last_page' => 5]);

    Sanctum::actingAs($user);

    $this->getJson('/api/profile/reading-stats')
        ->assertOk()
        ->assertJsonPath('documents_read', 3)
        ->assertJsonPath('consultations', 4)
        ->assertJsonPath('pages_reached', 15)
        ->assertJsonPath('top_categories', [
            ['name' => 'Droit', 'documents' => 2],
            ['name' => 'Économie', 'documents' => 1],
        ]);
});

// ---------- Documents similaires ----------

test('les documents similaires privilégient les auteurs communs puis la catégorie, sans le document lui-même', function () {
    $category = Category::factory()->create();
    $author = Author::factory()->create();

    $doc = publishedDoc(['category_id' => $category->id, 'keywords' => 'finance, banque']);
    $doc->authors()->attach($author);

    $sameAuthor = publishedDoc(['title' => 'Même auteur']);
    $sameAuthor->authors()->attach($author);
    publishedDoc(['title' => 'Même catégorie', 'category_id' => $category->id]);
    publishedDoc(['title' => 'Même mot-clé', 'keywords' => 'Banque']);
    publishedDoc(['title' => 'Sans lien']);
    Document::factory()->create(['title' => 'Brouillon lié', 'category_id' => $category->id, 'status' => 'brouillon']);

    $titles = collect($this->getJson("/api/documents/{$doc->slug}/similar")->assertOk()->json())->pluck('title')->all();

    expect($titles)->toBe(['Même auteur', 'Même catégorie', 'Même mot-clé']);
});
