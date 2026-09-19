<?php

use App\Models\Library;
use App\Models\Permission;
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

test('les actions Document restent soumises à permission', function () {
    Sanctum::actingAs(documentModuleLibrarian());

    $this->postJson('/api/documents', [])->assertForbidden();
});

test('voir_documents n\'est plus proposée mais les permissions d\'action restent', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $names = collect($this->getJson('/api/permissions')->assertOk()->json())->pluck('name');

    expect($names)->not->toContain('voir_documents')
        ->and($names)->toContain('ajouter_document', 'modifier_document', 'publier_document', 'supprimer_document');
});
