<?php

// Une adresse e-mail identifie un seul compte. Tant que le compte est dans la corbeille
// (restaurable), l'adresse reste réservée ; après sa suppression définitive, elle peut
// servir à créer un nouveau compte, quel que soit le point d'entrée.

use App\Models\AccountRequest;
use App\Models\Library;
use App\Models\MemberRegistry;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

function reuseStudentPayload(string $email): array
{
    return [
        'last_name' => 'Rabe',
        'first_name' => 'Hery',
        'email' => $email,
        'phone' => '0340000000',
        'gender' => 'masculin',
        'address' => 'Mahajanga',
        'role' => 'etudiant',
        'niveau_type' => 'Université',
        'date_of_birth' => now()->subYears(16)->toDateString(),
        'birth_place' => 'Mahajanga',
        'student_card_number' => 'CARTE-'.uniqid(),
        'school' => 'IOSTM',
        'filiere' => 'Informatique',
        'niveau_detail' => 'L1',
    ];
}

function reuseAdmin(): User
{
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Sanctum::actingAs($admin);

    return $admin;
}

/** Crée un étudiant par l'administrateur, le met à la corbeille puis le supprime définitivement. */
function createThenForceDelete(string $email): void
{
    test()->postJson('/api/users/creer', reuseStudentPayload($email))->assertSuccessful();
    $user = User::where('email', $email)->firstOrFail();

    test()->deleteJson("/api/users/{$user->id}", ["reason" => "Départ de l'université"])->assertSuccessful();
    test()->deleteJson("/api/trash/users/{$user->id}")->assertSuccessful();

    expect(User::withTrashed()->where('email', $email)->exists())->toBeFalse();
}

beforeEach(fn () => Mail::fake());

it('l\'administrateur recrée un compte avec l\'adresse d\'un compte supprimé définitivement', function () {
    reuseAdmin();
    createThenForceDelete('reuse@example.test');

    $this->postJson('/api/users/creer', reuseStudentPayload('reuse@example.test'))->assertSuccessful();

    expect(User::where('email', 'reuse@example.test')->count())->toBe(1);
});

it('le site public accepte une demande avec l\'adresse d\'un compte supprimé définitivement', function () {
    reuseAdmin();
    createThenForceDelete('public@example.test');

    auth()->forgetGuards(); // visiteur non connecté
    $this->postJson('/api/account-requests', reuseStudentPayload('public@example.test'))->assertSuccessful();

    expect(AccountRequest::where('email', 'public@example.test')->whereIn('status', ['en_attente', 'verifiee'])->exists())->toBeTrue();
});

it('le bibliothécaire crée une demande avec l\'adresse d\'un compte supprimé définitivement', function () {
    reuseAdmin();
    createThenForceDelete('biblio@example.test');

    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
    $librarian->permissions()->attach(Permission::where('name', 'ajouter_utilisateur')->firstOrFail()->id);
    Sanctum::actingAs($librarian);

    $this->postJson('/api/account-requests/by-librarian', reuseStudentPayload('biblio@example.test'))->assertSuccessful();
});

it('garde l\'adresse réservée tant que le compte est dans la corbeille', function () {
    reuseAdmin();
    $this->postJson('/api/users/creer', reuseStudentPayload('corbeille@example.test'))->assertSuccessful();
    $user = User::where('email', 'corbeille@example.test')->firstOrFail();
    $this->deleteJson("/api/users/{$user->id}", ["reason" => "Départ de l'université"])->assertSuccessful();

    // Message clair (pas d'erreur serveur) : le compte peut encore être restauré.
    $this->postJson('/api/users/creer', reuseStudentPayload('corbeille@example.test'))
        ->assertStatus(422)
        ->assertJson(fn ($json) => $json->where('message', fn ($m) => str_contains($m, 'corbeille'))->etc());

    auth()->forgetGuards();
    $this->postJson('/api/account-requests', reuseStudentPayload('corbeille@example.test'))
        ->assertStatus(422)
        ->assertJson(fn ($json) => $json->where('message', fn ($m) => str_contains($m, 'corbeille'))->etc());

    // Le bibliothécaire était auparavant accepté, puis la validation échouait (erreur 500).
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
    $librarian->permissions()->attach(Permission::where('name', 'ajouter_utilisateur')->firstOrFail()->id);
    Sanctum::actingAs($librarian);
    $this->postJson('/api/account-requests/by-librarian', reuseStudentPayload('corbeille@example.test'))
        ->assertStatus(422)
        ->assertJson(fn ($json) => $json->where('message', fn ($m) => str_contains($m, 'corbeille'))->etc());

    expect(AccountRequest::where('email', 'corbeille@example.test')->whereIn('status', ['en_attente', 'verifiee'])->exists())->toBeFalse();
});

it('refuse proprement de valider une demande dont l\'adresse appartient à un compte en corbeille', function () {
    reuseAdmin();
    $this->postJson('/api/users/creer', reuseStudentPayload('valid@example.test'))->assertSuccessful();
    $user = User::where('email', 'valid@example.test')->firstOrFail();
    $this->deleteJson("/api/users/{$user->id}", ['reason' => 'Test'])->assertSuccessful();

    // Demande antérieure (ou importée) restée en attente de validation.
    $request = AccountRequest::factory()->create(['email' => 'valid@example.test', 'status' => 'verifiee']);

    $this->postJson("/api/account-requests/{$request->id}/validate")
        ->assertStatus(422)
        ->assertJson(fn ($json) => $json->where('message', fn ($m) => str_contains($m, 'corbeille'))->etc());

    // Après la suppression définitive, la même demande peut être validée.
    $this->deleteJson("/api/trash/users/{$user->id}")->assertSuccessful();
    $this->postJson("/api/account-requests/{$request->id}/validate")->assertSuccessful();

    expect(User::where('email', 'valid@example.test')->count())->toBe(1);
});
