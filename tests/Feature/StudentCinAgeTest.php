<?php

// Formulaire étudiant (site public, administrateur, bibliothécaire) : la CIN n'est demandée
// et obligatoire qu'à partir de 18 ans ; pour un mineur elle n'est jamais enregistrée.

use App\Models\AccountRequest;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

function studentPayload(string $birthDate, array $overrides = []): array
{
    return array_merge([
        'last_name' => 'Rabe',
        'first_name' => 'Hery',
        'email' => 'hery.'.uniqid().'@example.test',
        'phone' => '0340000000',
        'gender' => 'masculin',
        'address' => 'Mahajanga',
        'role' => 'etudiant',
        'niveau_type' => 'Université',
        'date_of_birth' => $birthDate,
        'birth_place' => 'Mahajanga',
        'cin_number' => '',
        'cin_issued_at' => '',
        'student_card_number' => 'CARTE-'.uniqid(),
        'school' => 'IOSTM',
        'filiere' => 'Informatique',
        'niveau_detail' => 'L1',
    ], $overrides);
}

function adultBirthDate(): string
{
    return now()->subYears(20)->toDateString();
}

function minorBirthDate(): string
{
    return now()->subYears(16)->toDateString();
}

$withCin = ['cin_number' => '123456789012', 'cin_issued_at' => '2024-01-15'];

// Chaque point d'entrée : [URL, rôle de l'utilisateur connecté (null = visiteur)].
dataset('formulaires étudiant', [
    'site public' => ['/api/account-requests', null],
    'administrateur' => ['/api/users/creer', 'administrateur'],
    'bibliothécaire' => ['/api/account-requests/by-librarian', 'bibliothecaire'],
]);

function actAs(?string $role): void
{
    Mail::fake();
    if ($role === 'administrateur') {
        Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));
    } elseif ($role === 'bibliothecaire') {
        $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
        $librarian->permissions()->attach(Permission::where('name', 'ajouter_utilisateur')->firstOrFail()->id);
        Sanctum::actingAs($librarian);
    }
}

// Le compte (administrateur) ou la demande (site public, bibliothécaire) créé pour cet e-mail.
function createdFor(string $email): User|AccountRequest|null
{
    return User::where('email', $email)->first() ?? AccountRequest::where('email', $email)->first();
}

test('mineur : inscription acceptée sans CIN', function (string $url, ?string $role) {
    actAs($role);
    $payload = studentPayload(minorBirthDate());

    $this->postJson($url, $payload)->assertSuccessful();

    expect(createdFor($payload['email'])->cin_number)->toBeNull();
})->with('formulaires étudiant');

test('mineur : une CIN envoyée malgré tout n\'est pas enregistrée', function (string $url, ?string $role) use ($withCin) {
    actAs($role);
    $payload = studentPayload(minorBirthDate(), $withCin);

    $this->postJson($url, $payload)->assertSuccessful();

    $created = createdFor($payload['email']);
    expect($created->cin_number)->toBeNull()->and($created->cin_issued_at)->toBeNull();
})->with('formulaires étudiant');

test('majeur : CIN et date de délivrance obligatoires', function (string $url, ?string $role) {
    actAs($role);

    $this->postJson($url, studentPayload(adultBirthDate()))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['cin_number', 'cin_issued_at'])
        ->assertJsonPath('errors.cin_number.0', 'Le n° de CIN est obligatoire à partir de 18 ans.');
})->with('formulaires étudiant');

test('majeur : inscription acceptée avec la CIN, qui est enregistrée', function (string $url, ?string $role) use ($withCin) {
    actAs($role);
    $payload = studentPayload(adultBirthDate(), $withCin);

    $this->postJson($url, $payload)->assertSuccessful();

    expect(createdFor($payload['email'])->cin_number)->toBe('123456789012');
})->with('formulaires étudiant');

test('18 ans révolus aujourd\'hui : la CIN est obligatoire ; la veille des 18 ans : non', function () {
    actAs(null);

    $this->postJson('/api/account-requests', studentPayload(now()->subYears(18)->toDateString()))
        ->assertStatus(422)
        ->assertJsonValidationErrors('cin_number');

    $this->postJson('/api/account-requests', studentPayload(now()->subYears(18)->addDay()->toDateString()))
        ->assertSuccessful();
});

test('une date de naissance future est refusée', function () {
    actAs(null);

    $this->postJson('/api/account-requests', studentPayload(now()->addDay()->toDateString()))
        ->assertStatus(422)
        ->assertJsonValidationErrors('date_of_birth');
});
