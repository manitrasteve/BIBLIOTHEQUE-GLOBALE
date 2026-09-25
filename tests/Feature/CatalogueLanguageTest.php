<?php

// Catalogue : chaque document de la liste indique sa langue (affichée sur les cartes).

use App\Models\Document;
use App\Models\Favorite;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

test('la liste du catalogue renvoie la langue de chaque document', function () {
    Document::factory()->create(['status' => 'publie', 'access_level' => 'public', 'language' => 'mg', 'niveau' => 'L1', 'title' => 'Tantara']);

    $this->getJson('/api/documents')
        ->assertOk()
        ->assertJsonPath('data.0.title', 'Tantara')
        ->assertJsonPath('data.0.language', 'mg')
        ->assertJsonPath('data.0.niveau', 'L1');
});

test('les favoris renvoient aussi la langue du document', function () {
    $user = User::factory()->create(['is_active' => true]);
    $document = Document::factory()->create(['status' => 'publie', 'language' => 'en', 'niveau' => 'M2']);
    Favorite::create(['user_id' => $user->id, 'document_id' => $document->id]);
    Sanctum::actingAs($user);

    $this->getJson('/api/favorites')
        ->assertOk()
        ->assertJsonPath('data.0.document.language', 'en')
        ->assertJsonPath('data.0.document.niveau', 'M2');
});

test('le catalogue indique les documents en favori du lecteur connecté', function () {
    $user = User::factory()->create(['is_active' => true]);
    $favori = Document::factory()->create(['status' => 'publie', 'title' => 'Aimé', 'published_at' => now()]);
    Document::factory()->create(['status' => 'publie', 'title' => 'Autre', 'published_at' => now()->subDay()]);
    Favorite::create(['user_id' => $user->id, 'document_id' => $favori->id]);
    Sanctum::actingAs($user);

    $this->getJson('/api/documents')
        ->assertOk()
        ->assertJsonPath('data.0.title', 'Aimé')
        ->assertJsonPath('data.0.is_favorited', true)
        ->assertJsonPath('data.1.is_favorited', false);
});

test('le catalogue reste public : visiteur ou jeton invalide donnent is_favorited à false', function () {
    Document::factory()->create(['status' => 'publie']);

    $this->getJson('/api/documents')->assertOk()->assertJsonPath('data.0.is_favorited', false);
    $this->withToken('jeton-invalide')->getJson('/api/documents')->assertOk()->assertJsonPath('data.0.is_favorited', false);
});
