<?php

// Fiche document (route publique) : avec un vrai jeton Bearer, la réponse doit connaître le lecteur.

use App\Models\Document;
use App\Models\Favorite;
use App\Models\User;

test('la fiche document reconnaît le lecteur connecté par jeton (favori et droit de lecture)', function () {
    $user = User::factory()->create(['is_active' => true]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'public']);
    Favorite::create(['user_id' => $user->id, 'document_id' => $document->id]);
    $token = $user->createToken('test')->plainTextToken;

    $this->withToken($token)->getJson("/api/documents/{$document->slug}")
        ->assertOk()
        ->assertJsonPath('is_favorited', true)
        ->assertJsonPath('can_view_content', true);
});

test('la fiche document reste publique : visiteur ou jeton invalide', function () {
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'public']);

    $this->getJson("/api/documents/{$document->slug}")->assertOk()->assertJsonPath('is_favorited', false);
    $this->withToken('jeton-invalide')->getJson("/api/documents/{$document->slug}")
        ->assertOk()
        ->assertJsonPath('is_favorited', false)
        ->assertJsonPath('can_view_content', false);
});

test('document restreint : lisible par un membre de sa bibliothèque, pas par celui d\'une autre', function () {
    $bibA = \App\Models\Library::factory()->create();
    $bibB = \App\Models\Library::factory()->create();
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'restreint', 'library_id' => $bibA->id]);
    $membreA = User::factory()->create(['is_active' => true, 'role' => 'etudiant', 'library_id' => $bibA->id]);
    $membreB = User::factory()->create(['is_active' => true, 'role' => 'etudiant', 'library_id' => $bibB->id]);

    $this->withToken($membreA->createToken('a')->plainTextToken)->getJson("/api/documents/{$document->slug}")
        ->assertOk()->assertJsonPath('can_view_content', true);

    app('auth')->forgetGuards();

    $this->withToken($membreB->createToken('b')->plainTextToken)->getJson("/api/documents/{$document->slug}")
        ->assertOk()->assertJsonPath('can_view_content', false);
});
