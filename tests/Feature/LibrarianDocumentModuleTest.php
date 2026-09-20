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

// Documents créés dans la bibliothèque du compte connecté (un bibliothécaire ne gère que la sienne).
function moduleDocs(int $count, array $attributes = [])
{
    $own = auth()->user()?->library_id ? ['library_id' => auth()->user()->library_id] : [];

    return Document::factory()->count($count)->create(array_merge($own, $attributes));
}

test('un bibliothécaire sans aucune permission accède à la liste des documents', function () {
    Sanctum::actingAs(documentModuleLibrarian());

    $this->getJson('/api/documents-manage')->assertOk();
});

test('la recherche de documents est partielle, insensible à la casse et couvre toutes les pages', function (string $role) {
    Sanctum::actingAs($role === 'administrateur'
        ? User::factory()->create(['role' => 'administrateur', 'is_active' => true])
        : documentModuleLibrarian());

    foreach (['Analyse', 'Bibliothèque', 'Structure', 'Support', 'Stéphanie'] as $title) {
        moduleDocs(1, ['title' => $title, 'status' => 'publie']);
    }
    // Plus de 20 documents récents : « Steve » est relégué hors de la première page.
    moduleDocs(1, ['title' => 'Steve', 'status' => 'brouillon', 'created_at' => now()->subDays(5)]);
    moduleDocs(22, ['status' => 'publie', 'created_at' => now()]);

    $titles = fn (string $q) => collect($this->getJson('/api/documents-manage?' . http_build_query(['q' => $q]))->assertOk()->json('data'))->pluck('title')->all();

    // Un seul caractère, minuscule ou majuscule : mêmes résultats.
    expect($titles('s'))->toEqualCanonicalizing($titles('S'))->and($titles('s'))->toContain('Steve', 'Structure', 'Support', 'Stéphanie');
    // (« Stéphanie » contient un s : pas concerné par l'accent)
    // Affinage à mesure de la saisie, quelle que soit la casse.
    expect($titles('St'))->toContain('Steve', 'Structure')->not->toContain('Support', 'Analyse');
    expect($titles('ste'))->toEqualCanonicalizing($titles('STE'))->toContain('Steve')->not->toContain('Structure');
    // Accents : gérés par la collation utf8mb4_unicode_ci de MySQL (production), pas par SQLite (tests).
    if (\Illuminate\Support\Facades\DB::getDriverName() === 'mysql') {
        expect($titles('stephanie'))->toBe(['Stéphanie'])->and($titles('ste'))->toContain('Stéphanie');
    }
    // Aucun résultat.
    expect($titles('zzzqqq'))->toBe([]);
    // Champ vidé : liste initiale (première page, 20 documents), sans « Steve » relégué.
    $initial = $this->getJson('/api/documents-manage')->assertOk()->json();
    expect($initial['data'])->toHaveCount(20)->and($initial['total'])->toBe(28);
})->with(['administrateur', 'bibliothecaire']);

test('la recherche se combine avec le filtre de statut', function () {
    Sanctum::actingAs(documentModuleLibrarian());
    moduleDocs(1, ['title' => 'Structure publiée', 'status' => 'publie']);
    moduleDocs(1, ['title' => 'Structure brouillon', 'status' => 'brouillon']);

    $titles = collect($this->getJson('/api/documents-manage?q=structure&status=brouillon')->json('data'))->pluck('title')->all();

    expect($titles)->toBe(['Structure brouillon']);
});

test('un bibliothécaire peut ajouter un document sans permission (la validation répond, pas un 403)', function () {
    Sanctum::actingAs(documentModuleLibrarian());

    $this->postJson('/api/documents', [])->assertStatus(422);
});

test('un bibliothécaire peut modifier et archiver un document sans permission', function () {
    Sanctum::actingAs(documentModuleLibrarian());
    $document = moduleDocs(1, ['status' => 'publie'])->first();

    $this->postJson("/api/documents/{$document->id}", [])->assertOk();
    $this->postJson("/api/documents/{$document->id}/archive")->assertOk();
    expect($document->fresh()->status)->toBe('archive');
});

test('publier et supprimer restent soumis à permission', function () {
    Sanctum::actingAs(documentModuleLibrarian());
    $id = moduleDocs(1, ['status' => 'brouillon'])->first()->id; // sa propre bibliothèque : le refus vient bien de la permission

    $this->postJson("/api/documents/{$id}/publish")->assertForbidden();
    $this->deleteJson("/api/documents/{$id}")->assertForbidden();
});

test('seules les permissions publier et supprimer restent dans la catégorie Document', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $names = collect($this->getJson('/api/permissions')->assertOk()->json())->pluck('name');

    expect($names)->not->toContain('voir_documents', 'ajouter_document', 'modifier_document')
        ->and($names)->toContain('publier_document', 'supprimer_document');
});
