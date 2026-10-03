<?php

use App\Models\AccountRequest;
use App\Models\AppNotification;
use App\Models\Library;
use App\Models\MemberRegistry;
use App\Models\User;

test('un visiteur peut créer un ticket de demande de compte', function () {
    $library = Library::factory()->create();

    $response = $this->postJson('/api/account-requests', [
        'last_name' => 'Nomenjanahary',
        'first_name' => 'Steve',
        'email' => 'steve@example.com',
        'phone' => '+261331234567',
        'gender' => 'masculin',
        'address' => 'Mahavoky',
        'library_id' => $library->id,
    ]);

    $response->assertCreated();
    $response->assertJsonPath('status', 'en_attente');
    expect($response->json('request_number'))->toMatch('/^REQ-\d{4}-[A-Z0-9]+-\d{4}$/');
});

test('le numéro de ticket s\'incrémente correctement sur une même année', function () {
    $library = Library::factory()->create();

    $first = AccountRequest::factory()->create(['library_id' => $library->id]);
    $second = AccountRequest::factory()->create(['library_id' => $library->id]);

    expect($first->request_number)->not->toBe($second->request_number);
});

test('un bibliothécaire peut créer le compte à partir d\'un ticket valide', function () {
    $library = Library::factory()->create();
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id]);
    $accountRequest = AccountRequest::factory()->create(['library_id' => $library->id]);

    $response = $this->actingAs($librarian, 'sanctum')->postJson(
        "/api/account-requests/{$accountRequest->id}/create-account",
        [
            'email' => 'nouveau.compte@example.com',
            'role' => 'etudiant',
            'password' => 'motdepasse123',
        ]
    );

    $response->assertCreated();
    expect($accountRequest->fresh()->status)->toBe('traitee');

    $newUser = User::where('email', 'nouveau.compte@example.com')->first();
    expect($newUser)->not->toBeNull();
    expect($newUser->is_active)->toBeFalse(); // en attente de validation Admin
});

test('un étudiant ne peut pas créer de compte depuis un ticket', function () {
    $library = Library::factory()->create();
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $accountRequest = AccountRequest::factory()->create(['library_id' => $library->id]);

    $response = $this->actingAs($student, 'sanctum')->postJson(
        "/api/account-requests/{$accountRequest->id}/create-account",
        ['email' => 'x@example.com', 'role' => 'etudiant', 'password' => 'motdepasse123']
    );

    $response->assertStatus(403);
});

test('l\'administrateur peut activer un compte en attente', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $pendingUser = User::factory()->create(['is_active' => false]);

    $response = $this->actingAs($admin, 'sanctum')
        ->postJson("/api/account-requests/users/{$pendingUser->id}/activate");

    $response->assertOk();
    expect($pendingUser->fresh()->is_active)->toBeTrue();
});

test('la validation administrateur envoie une notification de validation au bibliothécaire', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $librarian = User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
        'library_id' => $library->id,
    ]);
    $accountRequest = AccountRequest::factory()->create([
        'library_id' => $library->id,
        'status' => 'verifiee',
        'validation_deadline_at' => now()->addDay(),
    ]);

    $this->actingAs($admin, 'sanctum')->postJson(
        "/api/account-requests/{$accountRequest->id}/validate"
    )->assertOk();

    expect(AppNotification::where('user_id', $librarian->id)->latest()->first())
        ->type->toBe('account_request_validated')
        ->title->toBe('Demande de compte validée');
});

test('une validation répétée réutilise le compte, le registre et le token existants', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $accountRequest = AccountRequest::factory()->create([
        'library_id' => $library->id,
        'status' => 'verifiee',
        'validation_deadline_at' => now()->addDay(),
    ]);

    $url = "/api/account-requests/{$accountRequest->id}/validate";
    $this->actingAs($admin, 'sanctum')->postJson($url)->assertOk();

    $validatedRequest = $accountRequest->fresh();
    $userId = $validatedRequest->created_user_id;
    $tokenHash = $validatedRequest->setup_token_hash;

    $this->actingAs($admin, 'sanctum')->postJson($url)
        ->assertOk()
        ->assertJsonPath('message', 'Cette demande a déjà été traitée.');

    expect(User::where('email', $accountRequest->email)->count())->toBe(1);
    expect(MemberRegistry::where('user_id', $userId)->count())->toBe(1);
    expect($accountRequest->fresh()->setup_token_hash)->toBe($tokenHash);
});
