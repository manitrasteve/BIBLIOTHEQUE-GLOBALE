<?php

use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

function librarianWith(array $permissions = []): User
{
    $librarian = User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
        'library_id' => Library::factory()->create()->id,
    ]);

    foreach ($permissions as $name) {
        $librarian->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
    }

    return $librarian;
}

function libraryPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Bibliothèque Test',
        'address' => 'Rue 1, Mahajanga',
        'location' => 'Ambondrona',
        'opening_hours' => '08h00 - 17h00',
        'opening_days' => 'Lundi - Vendredi',
        'photo' => UploadedFile::fake()->image('couverture.jpg', 800, 450),
    ], $overrides);
}

test('modifier une bibliothèque : réservé à l\'admin ou au bibliothécaire ayant modifier_bibliotheque, sans droit d\'ajout ni de suppression', function () {
    Storage::fake('public');
    $library = Library::factory()->create(['name' => 'Ancien nom']);

    // Sans permission, ou avec seulement « voir » / « ajouter » : refusé.
    foreach ([[], ['voir_bibliotheques'], ['ajouter_bibliotheque']] as $permissions) {
        $this->actingAs(librarianWith($permissions), 'sanctum')->postJson("/api/libraries/{$library->id}", ['name' => 'Piraté'])->assertForbidden();
    }
    expect($library->fresh()->name)->toBe('Ancien nom');

    // Avec « modifier » : modification autorisée, mais ni création ni suppression.
    $editor = librarianWith(['modifier_bibliotheque']);
    $this->actingAs($editor, 'sanctum')->postJson("/api/libraries/{$library->id}", ['name' => 'Nouveau nom'])->assertOk();
    $this->actingAs($editor, 'sanctum')->putJson("/api/libraries/{$library->id}", ['name' => 'Nouveau nom 2'])->assertOk();
    expect($library->fresh()->name)->toBe('Nouveau nom 2');
    $this->actingAs($editor, 'sanctum')->postJson('/api/libraries', libraryPayload())->assertForbidden();
    $this->actingAs($editor, 'sanctum')->deleteJson("/api/libraries/{$library->id}")->assertForbidden();

    // L'administrateur garde tous ses droits.
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $this->actingAs($admin, 'sanctum')->postJson("/api/libraries/{$library->id}", ['name' => 'Par admin'])->assertOk();
    $this->actingAs($admin, 'sanctum')->deleteJson("/api/libraries/{$library->id}")->assertOk();
});

test('les trois permissions de la catégorie bibliothèques sont proposées', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $names = collect($this->actingAs($admin, 'sanctum')->getJson('/api/permissions')->json())
        ->where('category', 'bibliotheques')->pluck('name')->all();

    expect($names)->toEqualCanonicalizing(['voir_bibliotheques', 'ajouter_bibliotheque', 'modifier_bibliotheque']);
});

test('les cinq nouvelles permissions sont proposées à l\'administrateur avec leur catégorie', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $permissions = collect($this->actingAs($admin, 'sanctum')->getJson('/api/permissions')->json())->keyBy('name');

    expect($permissions['ajouter_bibliotheque']['category'])->toBe('bibliotheques');
    expect($permissions['ajouter_bibliotheque']['label'])->toBe('Ajouter une bibliothèque');
    foreach ([
        'voir_popularite' => 'Voir la popularité',
        'voir_avis_utilisateurs' => 'Voir les avis des utilisateurs',
        'voir_signalements' => 'Voir les signalements',
        'voir_statistiques' => 'Voir les statistiques',
    ] as $name => $label) {
        expect($permissions[$name]['category'])->toBe('consultation');
        expect($permissions[$name]['label'])->toBe($label);
    }
});

test('ajouter une bibliothèque : refusé sans permission, autorisé avec, photo obligatoire', function () {
    Storage::fake('public');

    $this->actingAs(librarianWith(), 'sanctum')->postJson('/api/libraries', libraryPayload())->assertForbidden();
    expect(Library::where('name', 'Bibliothèque Test')->exists())->toBeFalse();

    $librarian = librarianWith(['ajouter_bibliotheque']);

    $created = $this->actingAs($librarian, 'sanctum')->postJson('/api/libraries', libraryPayload());
    $created->assertCreated();
    expect($created->json('cover_url'))->not->toBeNull();
    Storage::disk('public')->assertExists(Library::where('name', 'Bibliothèque Test')->firstOrFail()->photo_path);

    // Champs obligatoires : nom, adresse, localisation, horaires, jours d'ouverture, photo.
    foreach (['name', 'address', 'location', 'opening_hours', 'opening_days', 'photo'] as $field) {
        $payload = libraryPayload(['name' => "Autre {$field}"]);
        unset($payload[$field]);
        $this->actingAs($librarian, 'sanctum')->postJson('/api/libraries', $payload)->assertStatus(422);
    }

    // Type de fichier invalide.
    $this->actingAs($librarian, 'sanctum')
        ->postJson('/api/libraries', libraryPayload(['name' => 'Pdf', 'photo' => UploadedFile::fake()->create('c.pdf', 10, 'application/pdf')]))
        ->assertStatus(422);
});

test('la permission d\'ajout ne permet ni de modifier ni de supprimer une bibliothèque', function () {
    $librarian = librarianWith(['ajouter_bibliotheque']);
    $library = Library::factory()->create();

    $this->actingAs($librarian, 'sanctum')->postJson("/api/libraries/{$library->id}", ['name' => 'X'])->assertForbidden();
    $this->actingAs($librarian, 'sanctum')->putJson("/api/libraries/{$library->id}", ['name' => 'X'])->assertForbidden();
    $this->actingAs($librarian, 'sanctum')->deleteJson("/api/libraries/{$library->id}")->assertForbidden();
});

test('une ancienne bibliothèque sans photo reste lisible et modifiable', function () {
    Storage::fake('public');
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $legacy = Library::factory()->create(['photo_path' => null]);

    expect($this->getJson('/api/libraries')->json('0.cover_url'))->toBeNull();

    $this->actingAs($admin, 'sanctum')->postJson("/api/libraries/{$legacy->id}", ['name' => 'Renommée'])->assertOk();
    expect($legacy->fresh()->name)->toBe('Renommée');

    $updated = $this->actingAs($admin, 'sanctum')->postJson("/api/libraries/{$legacy->id}", ['photo' => UploadedFile::fake()->image('n.png')]);
    $updated->assertOk();
    expect($updated->json('cover_url'))->not->toBeNull();
});

test('les permissions de consultation sont indépendantes et en lecture seule', function () {
    $endpoints = [
        'voir_popularite' => '/api/engagement-stats',
        'voir_avis_utilisateurs' => '/api/feedbacks',
        'voir_signalements' => '/api/problem-reports',
        'voir_statistiques' => '/api/dashboard/admin',
    ];

    $this->actingAs(librarianWith(), 'sanctum');
    foreach ($endpoints as $url) {
        $this->actingAs(librarianWith(), 'sanctum')->getJson($url)->assertForbidden();
    }

    foreach ($endpoints as $granted => $grantedUrl) {
        $librarian = librarianWith([$granted]);

        foreach ($endpoints as $permission => $url) {
            $response = $this->actingAs($librarian, 'sanctum')->getJson($url);
            $permission === $granted ? $response->assertOk() : $response->assertForbidden();
        }

        // Aucun droit de modification / traitement / suppression.
        $this->actingAs($librarian, 'sanctum')->deleteJson('/api/feedbacks/clear-all')->assertForbidden();
        $this->actingAs($librarian, 'sanctum')->deleteJson('/api/problem-reports/clear-all')->assertForbidden();
        $this->actingAs($librarian, 'sanctum')->getJson('/api/trash')->assertForbidden();
        $this->actingAs($librarian, 'sanctum')->getJson('/api/users')->assertForbidden();
    }
});

test('l\'administrateur garde l\'accès aux consultations', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    foreach (['/api/engagement-stats', '/api/feedbacks', '/api/problem-reports', '/api/dashboard/admin'] as $url) {
        $this->actingAs($admin, 'sanctum')->getJson($url)->assertOk();
    }
});

function adminTeacherPayload(array $overrides = []): array
{
    return array_merge([
        'library_id' => Library::factory()->create()->id,
        'role' => 'enseignant',
        'last_name' => 'Rabe',
        'first_name' => '',
        'email' => 'enseignant@example.test',
        'phone' => '0340000000',
        'address' => 'Mahajanga',
        'gender' => 'masculin',
        'date_of_birth' => '1980-01-01',
        'faculty' => 'IOSTM',
        'teaching_specialty' => 'Informatique',
        'department' => '',
        'position' => '',
    ], $overrides);
}

test('formulaire enseignant : champs obligatoires validés, département et fonction facultatifs', function () {
    Mail::fake();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    foreach (['last_name', 'email', 'phone', 'address', 'gender', 'date_of_birth', 'faculty', 'teaching_specialty', 'library_id'] as $index => $field) {
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/users/creer', adminTeacherPayload(['email' => "t{$index}@example.test", $field => ""]))
            ->assertStatus(422);
    }

    $this->actingAs($admin, 'sanctum')->postJson('/api/users/creer', adminTeacherPayload())->assertCreated();
});

test('formulaire chercheur : champs obligatoires validés, adresse et laboratoire facultatifs', function () {
    Mail::fake();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $payload = fn (array $overrides = []) => adminTeacherPayload($overrides + [
        'role' => 'chercheur',
        'teaching_specialty' => '',
        'researcher_field' => 'Biologie',
        'specialty' => 'Génétique',
    ]);

    foreach (['last_name', 'email', 'phone', 'gender', 'date_of_birth', 'faculty', 'researcher_field', 'specialty'] as $index => $field) {
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/users/creer', $payload(['email' => "c{$index}@example.test", $field => ""]))
            ->assertStatus(422);
    }

    $this->actingAs($admin, 'sanctum')
        ->postJson('/api/users/creer', $payload(['address' => '', 'research_lab' => '']))
        ->assertCreated();
});
