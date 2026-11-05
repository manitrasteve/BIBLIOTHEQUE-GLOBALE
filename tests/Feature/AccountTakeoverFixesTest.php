<?php

// Failles de prise de compte corrigées : renvoi du lien de création, création de compte depuis un
// ticket, validation sur une adresse déjà utilisée, changement d'adresse e-mail du profil.

use App\Models\AccountRequest;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['mail.default' => 'array']);
});

function takeoverLibrarian(Library $library, array $permissions = []): User
{
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id]);
    foreach ($permissions as $name) {
        $librarian->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
    }

    return $librarian;
}

/** Demande validée dont le compte existe déjà. */
function validatedRequestFor(User $member, Library $library): AccountRequest
{
    return AccountRequest::factory()->create([
        'library_id' => $library->id,
        'email' => $member->email,
        'status' => 'validee',
        'created_user_id' => $member->id,
        'setup_token_hash' => hash('sha256', 'ancien-jeton'),
        'setup_expires_at' => now()->addDay(),
    ]);
}

test('le renvoi du lien est refusé à un bibliothécaire sans permission', function () {
    $library = Library::factory()->create();
    $member = User::factory()->create(['role' => 'etudiant', 'library_id' => $library->id, 'password_set_at' => null]);
    $request = validatedRequestFor($member, $library);

    Sanctum::actingAs(takeoverLibrarian($library));
    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")->assertForbidden();
});

test('le renvoi du lien ne peut pas rouvrir un compte désactivé', function () {
    $library = Library::factory()->create();
    $member = User::factory()->create(['role' => 'etudiant', 'library_id' => $library->id, 'is_active' => false, 'password_set_at' => null]);
    $request = validatedRequestFor($member, $library);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));
    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'désactivé'));

    expect($request->fresh()->setup_token_hash)->toBe(hash('sha256', 'ancien-jeton'));
});

test('le renvoi du lien ne peut pas écraser un mot de passe déjà créé', function () {
    $library = Library::factory()->create();
    $member = User::factory()->create(['role' => 'etudiant', 'library_id' => $library->id, 'password_set_at' => now()]);
    $request = validatedRequestFor($member, $library);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));
    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")->assertStatus(422);
});

test('le lien renvoyé part à l\'adresse actuelle du compte, pas à celle de la demande', function () {
    $library = Library::factory()->create();
    $member = User::factory()->create(['role' => 'etudiant', 'library_id' => $library->id, 'password_set_at' => null, 'email' => 'nouvelle@example.test']);
    $request = validatedRequestFor($member, $library);
    $request->update(['email' => 'ancienne@example.test']);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));
    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")->assertOk();

    $recipients = collect(app('mailer')->getSymfonyTransport()->messages())
        ->flatMap(fn ($sent) => array_map(fn ($a) => $a->getAddress(), $sent->getOriginalMessage()->getTo()));
    expect($recipients->all())->toContain('nouvelle@example.test')->not->toContain('ancienne@example.test');
});

test('créer un compte depuis un ticket exige la permission et garde le rôle de la demande', function () {
    $library = Library::factory()->create();
    $ticket = AccountRequest::factory()->create(['library_id' => $library->id, 'role' => 'etudiant']);
    $payload = ['email' => 'promu@example.test', 'role' => 'enseignant', 'password' => 'motdepasse123'];

    Sanctum::actingAs(takeoverLibrarian($library));
    $this->postJson("/api/account-requests/{$ticket->id}/create-account", $payload)->assertForbidden();

    Sanctum::actingAs(takeoverLibrarian($library, ['ajouter_utilisateur']));
    $this->postJson("/api/account-requests/{$ticket->id}/create-account", $payload)
        ->assertStatus(422)->assertJsonValidationErrors('role');

    expect(User::where('email', 'promu@example.test')->exists())->toBeFalse();
});

test('valider une demande dont l\'adresse appartient déjà à un compte est refusé', function () {
    $library = Library::factory()->create();
    $existing = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => false, 'email' => 'dup@example.test', 'library_id' => $library->id]);
    $request = AccountRequest::factory()->create(['library_id' => $library->id, 'email' => 'dup@example.test', 'status' => 'verifiee']);

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));
    $this->postJson("/api/account-requests/{$request->id}/validate")->assertStatus(422);

    expect($request->fresh()->status)->toBe('verifiee')
        ->and($request->fresh()->created_user_id)->toBeNull()
        ->and($existing->fresh()->is_active)->toBeFalse();
});

test('changer d\'adresse e-mail exige le mot de passe actuel', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'email' => 'avant@example.test', 'password' => Hash::make('Secret123')]);
    DB::table('password_reset_tokens')->insert(['email' => 'avant@example.test', 'token' => 'x', 'created_at' => now()]);
    Sanctum::actingAs($user);

    $this->postJson('/api/profile', ['email' => 'apres@example.test'])
        ->assertStatus(422)->assertJsonValidationErrors('current_password');
    $this->postJson('/api/profile', ['email' => 'apres@example.test', 'current_password' => 'mauvais'])
        ->assertStatus(422)->assertJsonValidationErrors('current_password');
    expect($user->fresh()->email)->toBe('avant@example.test');

    $this->postJson('/api/profile', ['email' => 'apres@example.test', 'current_password' => 'Secret123'])->assertOk();
    expect($user->fresh()->email)->toBe('apres@example.test')
        ->and(DB::table('password_reset_tokens')->where('email', 'avant@example.test')->exists())->toBeFalse();
});

test('modifier son profil sans changer d\'adresse ne demande pas le mot de passe, et le laboratoire est enregistré', function () {
    $user = User::factory()->create(['role' => 'chercheur']);
    Sanctum::actingAs($user);

    $this->postJson('/api/profile', ['email' => $user->email, 'research_lab' => 'Laboratoire IH.SM'])->assertOk();
    expect($user->fresh()->research_lab)->toBe('Laboratoire IH.SM');
});
