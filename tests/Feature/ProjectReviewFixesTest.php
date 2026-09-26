<?php

// Corrections issues de la revue du projet : favoris dépubliés, conversation du personnel,
// lien de création du mot de passe après désactivation, e-mail du profil.

use App\Models\AccountRequest;
use App\Models\Document;
use App\Models\Favorite;
use App\Models\Library;
use App\Models\StaffConversation;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

test("« Mes favoris » n'affiche plus un document archivé (il ne pourrait plus être retiré)", function () {
    $user = User::factory()->create();
    $published = Document::factory()->create(['status' => 'publie', 'published_at' => now()]);
    $archived = Document::factory()->create(['status' => 'archive']);
    Favorite::create(['user_id' => $user->id, 'document_id' => $published->id]);
    Favorite::create(['user_id' => $user->id, 'document_id' => $archived->id]);

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/favorites')->assertOk();

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.document.slug'))->toBe($published->slug);
});

test("un bibliothécaire ne peut pas ouvrir la conversation d'un autre bibliothécaire", function () {
    User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $me = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);
    $other = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);

    Sanctum::actingAs($me);

    $this->getJson("/api/staff-discussions/conversation/{$other->id}")->assertForbidden();
    expect(StaffConversation::where('librarian_id', $other->id)->exists())->toBeFalse();
});

test("l'administrateur ouvre toujours la conversation d'un bibliothécaire", function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);

    Sanctum::actingAs($admin);

    $this->getJson("/api/staff-discussions/conversation/{$librarian->id}")
        ->assertOk()
        ->assertJsonPath('conversation.librarian_id', $librarian->id);
});

test('la désactivation invalide le lien de création du mot de passe encore en attente', function () {
    Mail::fake();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $user = User::factory()->create(['is_active' => false, 'password_set_at' => null]);
    $request = AccountRequest::factory()->create([
        'library_id' => Library::factory(),
        'email' => $user->email,
        'status' => 'validee',
        'created_user_id' => $user->id,
        'setup_token_hash' => Hash::make('jeton-secret'),
        'setup_expires_at' => now()->addDay(),
    ]);

    Sanctum::actingAs($admin);
    $this->postJson("/api/users/{$user->id}/deactivate", ['reason' => 'Test'])->assertOk();

    expect($request->fresh()->setup_token_hash)->toBeNull();

    $this->postJson('/api/account-requests/setup/jeton-secret', [
        'password' => 'motdepasse123',
        'password_confirmation' => 'motdepasse123',
    ])->assertNotFound();
    expect($user->fresh()->is_active)->toBeFalse();
});

test("le profil refuse l'e-mail d'un compte en corbeille avec un message explicite", function () {
    $trashed = User::factory()->create();
    $trashed->delete();
    $user = User::factory()->create();

    Sanctum::actingAs($user);

    $this->postJson('/api/profile', ['email' => $trashed->email])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', fn ($message) => str_contains($message, 'corbeille'));

    $this->postJson('/api/profile', ['email' => $user->email])->assertOk();
});

test("un compte créé directement par l'administrateur reçoit son numéro de compte", function () {
    Mail::fake();
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->postJson('/api/users/creer', [
        'last_name' => 'Rakoto', 'first_name' => 'Jean', 'email' => 'numero@example.test', 'phone' => '0340000000',
        'address' => 'Mahajanga', 'gender' => 'masculin', 'date_of_birth' => '1990-05-10', 'role' => 'chercheur',
        'faculty' => 'IOSTM', 'researcher_field' => 'Océanographie', 'specialty' => 'Courants marins',
    ])->assertCreated();

    $user = User::where('email', 'numero@example.test')->firstOrFail();
    $request = AccountRequest::where('created_user_id', $user->id)->firstOrFail();

    expect($user->matricule)->not->toBeNull()
        ->and($user->matricule)->toBe($request->matricule)
        ->and(\App\Models\MemberRegistry::where('user_id', $user->id)->value('matricule'))->toBe($user->matricule);
});
