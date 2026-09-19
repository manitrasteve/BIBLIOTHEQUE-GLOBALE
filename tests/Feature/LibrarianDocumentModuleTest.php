<?php

use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function documentModuleLibrarian(): User
{
    return User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
        'library_id' => Library::factory()->create()->id,
    ]);
}

test('un bibliothécaire sans aucune permission accède à la liste des documents', function () {
    Sanctum::actingAs(documentModuleLibrarian());

    $this->getJson('/api/documents-manage')->assertOk();
});

test('un bibliothécaire peut ajouter un document sans permission (la validation répond, pas un 403)', function () {
    Sanctum::actingAs(documentModuleLibrarian());

    $this->postJson('/api/documents', [])->assertStatus(422);
});

test('modifier, publier et supprimer restent soumis à permission', function () {
    Sanctum::actingAs(documentModuleLibrarian());

    $id = Document::factory()->create(['status' => 'publie'])->id;

    $this->postJson("/api/documents/{$id}/publish")->assertForbidden();
    $this->postJson("/api/documents/{$id}/archive")->assertForbidden();
    $this->deleteJson("/api/documents/{$id}")->assertForbidden();
});

test('voir_documents et ajouter_document ne sont plus proposées, les autres actions restent', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $names = collect($this->getJson('/api/permissions')->assertOk()->json())->pluck('name');

    expect($names)->not->toContain('voir_documents', 'ajouter_document')
        ->and($names)->toContain('modifier_document', 'publier_document', 'supprimer_document');
});
