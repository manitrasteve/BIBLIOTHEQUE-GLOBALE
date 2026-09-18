<?php

use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

test('un visiteur non connecté peut rechercher des documents publiés', function () {
    Document::factory()->create(['status' => 'publie', 'title' => 'Droit des affaires']);
    Document::factory()->create(['status' => 'brouillon', 'title' => 'Non publié']);

    $response = $this->getJson('/api/documents?q=Droit');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(1);
});

test('un visiteur non connecté ne peut pas consulter le PDF', function () {
    $document = Document::factory()->create(['status' => 'publie']);

    $response = $this->getJson("/api/documents/{$document->slug}/stream");

    $response->assertStatus(401);
});

test('un utilisateur connecté et actif peut consulter un document accessible', function () {
    Storage::fake('local');

    $document = Document::factory()->create([
        'status' => 'publie',
        'access_level' => 'authentifie',
        'file_path' => 'documents/test.pdf',
    ]);
    Storage::disk('local')->put($document->file_path, '%PDF-1.4 test');

    $user = User::factory()->create(['is_active' => true]);

    $response = $this->actingAs($user, 'sanctum')->get("/api/documents/{$document->slug}/stream");

    $response->assertOk();
    $this->assertDatabaseHas('consultations', ['user_id' => $user->id, 'document_id' => $document->id]);
});

test('un document restreint n\'est accessible qu\'aux utilisateurs de la même bibliothèque', function () {
    Storage::fake('local');

    $document = Document::factory()->create([
        'status' => 'publie',
        'access_level' => 'restreint',
        'file_path' => 'documents/test.pdf',
    ]);
    Storage::disk('local')->put($document->file_path, '%PDF-1.4 test');

    $otherLibrary = Library::factory()->create();
    $outsider = User::factory()->create(['is_active' => true, 'library_id' => $otherLibrary->id]);

    $response = $this->actingAs($outsider, 'sanctum')->getJson("/api/documents/{$document->slug}/stream");

    $response->assertStatus(403);
});

test('seul un bibliothécaire ou admin peut publier un document', function () {
    $document = Document::factory()->create(['status' => 'brouillon']);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);

    $response = $this->actingAs($student, 'sanctum')->postJson("/api/documents/{$document->id}/publish");

    $response->assertStatus(403);
});
