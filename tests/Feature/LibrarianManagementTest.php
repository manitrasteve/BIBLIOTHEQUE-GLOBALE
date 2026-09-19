<?php

use App\Models\Library;
use App\Models\MemberRegistry;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

function librarianPayload(Library $library): array
{
    return [
        'library_id' => $library->id,
        'last_name' => 'Rakoto',
        'first_name' => 'Soa',
        'gender' => 'feminin',
        'cin_number' => '123456789012',
        'cin_issued_at' => '2025-01-15',
        'address' => 'Mahajanga',
        'phone' => '+261340000000',
        'email' => 'soa.rakoto@example.com',
    ];
}

test('la création de bibliothécaire exige le genre et une CIN de douze chiffres', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur']);

    $withoutGender = librarianPayload($library);
    unset($withoutGender['gender']);

    $this->actingAs($admin, 'sanctum')->postJson('/api/librarians', $withoutGender)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('gender');

    $invalidCin = librarianPayload($library);
    $invalidCin['cin_number'] = '1234AB';
    $invalidCin['email'] = 'cin.invalide@example.com';

    $this->actingAs($admin, 'sanctum')->postJson('/api/librarians', $invalidCin)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('cin_number');
});

test('un administrateur crée un bibliothécaire en attente de création de mot de passe', function () {
    Mail::fake();
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur']);
    $payload = librarianPayload($library);

    $this->actingAs($admin, 'sanctum')->postJson('/api/librarians', $payload)
        ->assertCreated()
        ->assertJsonPath('user.email', $payload['email']);

    $user = User::where('email', $payload['email'])->firstOrFail();
    $registry = MemberRegistry::where('user_id', $user->id)->firstOrFail();

    expect($user->role)->toBe('bibliothecaire');
    expect($user->library_id)->toBe($library->id);
    expect($user->gender)->toBe('feminin');
    expect($user->cin_number)->toBe('123456789012');
    expect($user->cin_issued_at)->toBe('2025-01-15');
    expect($user->is_active)->toBeFalse();
    expect($user->password_set_at)->toBeNull();
    expect($user->matricule)->toMatch('/^BIB-\d{4}-\d{4}$/');
    expect($registry->matricule)->toBe($user->matricule);
    expect($registry->library_id)->toBe($library->id);
    expect($registry->status)->toBe('desactive');
    expect(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeTrue();
});

test('le lien de réinitialisation existant active le bibliothécaire après définition du mot de passe', function () {
    $library = Library::factory()->create();
    $user = User::factory()->create([
        'role' => 'bibliothecaire',
        'library_id' => $library->id,
        'is_active' => false,
        'password_set_at' => null,
    ]);
    MemberRegistry::create([
        'user_id' => $user->id,
        'library_id' => $library->id,
        'role' => 'bibliothecaire',
        'matricule' => 'BM-' . now()->format('Y') . '-999999',
        'last_name' => 'Test',
        'first_name' => 'Bibliothécaire',
        'status' => 'desactive',
    ]);
    $token = 'lien-securise-de-test';
    DB::table('password_reset_tokens')->insert([
        'email' => $user->email,
        'token' => Hash::make($token),
        'created_at' => now(),
    ]);

    $this->postJson('/api/reset-password', [
        'email' => $user->email,
        'token' => $token,
        'password' => 'nouveau-mot-de-passe',
        'password_confirmation' => 'nouveau-mot-de-passe',
    ])->assertOk();

    expect($user->fresh()->is_active)->toBeTrue();
    expect($user->fresh()->password_set_at)->not->toBeNull();
    expect(MemberRegistry::where('user_id', $user->id)->value('status'))->toBe('actif');
    expect(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeFalse();
});
