<?php

use App\Models\AccountRequest;
use App\Models\ActivityLog;
use App\Models\AppNotification;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

function addUserLibrarian(bool $withPermission = false): User
{
    $library = Library::factory()->create();
    $librarian = User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
        'library_id' => $library->id,
    ]);

    if ($withPermission) {
        $librarian->permissions()->attach(Permission::where('name', 'ajouter_utilisateur')->firstOrFail()->id);
    }

    return $librarian;
}

function addUserPayload(array $overrides = []): array
{
    return array_merge([
        'last_name' => 'Rakoto',
        'first_name' => 'Jean',
        'email' => 'jean.rakoto@example.test',
        'phone' => '0340000000',
        'gender' => 'masculin',
        'address' => 'Mahajanga',
        'role' => 'etudiant',
        'school' => 'IOSTM',
        'filiere' => 'Informatique',
        'niveau_detail' => 'L1',
    ], $overrides);
}

test('la permission « Ajouter un utilisateur » est proposée à l\'administrateur', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $response = $this->actingAs($admin, 'sanctum')->getJson('/api/permissions');

    $permission = collect($response->json())->firstWhere('name', 'ajouter_utilisateur');

    expect($permission)->not->toBeNull();
    expect($permission['label'])->toBe('Ajouter un utilisateur');
    expect($permission['category'])->toBe('utilisateurs');
});

test('l\'administrateur attribue puis retire la permission, avec notification et activité', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $librarian = addUserLibrarian();

    $grant = $this->actingAs($admin, 'sanctum')->putJson("/api/bibliothecaires/{$librarian->id}/permissions", [
        'permissions' => ['ajouter_utilisateur'],
    ]);

    $grant->assertOk();
    expect($grant->json('added'))->toContain('ajouter_utilisateur');
    expect($librarian->fresh()->hasPermission('ajouter_utilisateur'))->toBeTrue();
    expect(AppNotification::where('user_id', $librarian->id)->where('type', 'permissions_mises_a_jour')->count())->toBe(1);
    expect(ActivityLog::where('action', 'permissions_modifiees')->count())->toBe(1);

    $revoke = $this->actingAs($admin, 'sanctum')->putJson("/api/bibliothecaires/{$librarian->id}/permissions", [
        'permissions' => [],
    ]);

    $revoke->assertOk();
    expect($revoke->json('removed'))->toContain('ajouter_utilisateur');
    expect($librarian->fresh()->hasPermission('ajouter_utilisateur'))->toBeFalse();
});

test('la permission est exposée au frontend pour afficher l\'entrée de menu', function () {
    $with = addUserLibrarian(true);
    $without = addUserLibrarian();

    expect($this->actingAs($with, 'sanctum')->getJson('/api/me')->json('permissions'))->toContain('ajouter_utilisateur');
    expect($this->actingAs($without, 'sanctum')->getJson('/api/me')->json('permissions'))->not->toContain('ajouter_utilisateur');
});

test('un bibliothécaire sans la permission est refusé côté backend', function () {
    $librarian = addUserLibrarian();

    $this->actingAs($librarian, 'sanctum')
        ->postJson('/api/account-requests/by-librarian', addUserPayload())
        ->assertForbidden();

    expect(AccountRequest::count())->toBe(0);
});

test('un bibliothécaire avec la permission crée une demande et le numéro de compte est généré à la validation', function () {
    Mail::fake();
    $librarian = addUserLibrarian(true);
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $created = $this->actingAs($librarian, 'sanctum')
        ->postJson('/api/account-requests/by-librarian', addUserPayload());

    $created->assertCreated();
    $accountRequest = AccountRequest::firstOrFail();
    expect($accountRequest->status)->toBe('verifiee');
    expect($accountRequest->created_by)->toBe($librarian->id);

    $validated = $this->actingAs($admin, 'sanctum')->postJson("/api/account-requests/{$accountRequest->id}/validate");

    $validated->assertOk();
    expect($validated->json('user.matricule'))->toMatch('/^ETU-' . now()->year . '-\d{4}$/');
});

test('la permission ne donne pas le droit de créer un autre rôle que étudiant', function () {
    $librarian = addUserLibrarian(true);

    foreach (['administrateur', 'bibliothecaire', 'enseignant', 'chercheur'] as $role) {
        $this->actingAs($librarian, 'sanctum')
            ->postJson('/api/account-requests/by-librarian', addUserPayload(['role' => $role, 'email' => "{$role}@example.test"]))
            ->assertStatus(422);
    }

    expect(AccountRequest::count())->toBe(0);
});

test('les droits de l\'administrateur et des autres rôles ne changent pas', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);

    // L'administrateur garde toutes les permissions, mais la route reste réservée aux bibliothécaires.
    expect($admin->hasPermission('ajouter_utilisateur'))->toBeTrue();
    $this->actingAs($admin, 'sanctum')->postJson('/api/account-requests/by-librarian', addUserPayload())->assertForbidden();

    // Un étudiant reste refusé.
    $this->actingAs($student, 'sanctum')->postJson('/api/account-requests/by-librarian', addUserPayload())->assertForbidden();
});

test('attribuer la nouvelle permission ne donne aucun autre droit', function () {
    $librarian = addUserLibrarian(true);

    $this->actingAs($librarian, 'sanctum')->getJson('/api/trash')->assertForbidden();
    expect($librarian->hasPermission('voir_corbeille'))->toBeFalse();
    expect($librarian->hasPermission('ajouter_document'))->toBeFalse();
});
