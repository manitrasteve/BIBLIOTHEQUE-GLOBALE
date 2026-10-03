<?php

// Évolutions récentes : lien de création du mot de passe (72 h), compte actif dès la validation,
// renvoi du lien depuis « Utilisateurs », traitements groupés des demandes, numéro de demande,
// filtres des avis / signalements, et balayage des routes GET de l'API par rôle (aucune erreur 500).

use App\Models\AccountRequest;
use App\Models\Library;
use App\Models\ProblemReport;
use App\Models\User;
use App\Support\AccountRequestRules;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;

function sessionAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

function sessionLibrarian(): User
{
    return User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
}

function verifiedRequest(array $attributes = []): AccountRequest
{
    return AccountRequest::factory()->create($attributes + [
        'status' => 'verifiee',
        'role' => 'etudiant',
        'validation_deadline_at' => now()->addDay(),
        'library_id' => Library::factory()->create()->id,
    ]);
}

// ---------- Compte actif dès la validation, lien valable 72 h ----------

test('une demande validée crée un compte actif, avec un lien de création valable 72 h', function () {
    $request = verifiedRequest();
    Sanctum::actingAs(sessionAdmin());

    $this->postJson("/api/account-requests/{$request->id}/validate")->assertOk();

    $request->refresh();
    $user = $request->createdUser;
    expect($user->is_active)->toBeTrue()
        ->and($user->password_set_at)->toBeNull()
        ->and($request->setup_expires_at->between(now()->addHours(71), now()->addHours(73)))->toBeTrue();
});

test('le lien de création (bibliothécaire, compte réactivé) reste valable 72 h ; le « mot de passe oublié » 60 minutes', function () {
    $invited = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => false, 'password_set_at' => null]);
    DB::table('password_reset_tokens')->insert(['email' => $invited->email, 'token' => Hash::make('jeton-creation'), 'created_at' => now()->subHours(70)]);

    $this->postJson('/api/reset-password', [
        'email' => $invited->email, 'token' => 'jeton-creation', 'password' => 'MotDePasse123', 'password_confirmation' => 'MotDePasse123',
    ])->assertOk();
    expect($invited->fresh()->password_set_at)->not->toBeNull();

    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'password_set_at' => now()->subYear()]);
    DB::table('password_reset_tokens')->insert(['email' => $member->email, 'token' => Hash::make('jeton-oubli'), 'created_at' => now()->subHours(2)]);

    $this->postJson('/api/reset-password', [
        'email' => $member->email, 'token' => 'jeton-oubli', 'password' => 'MotDePasse123', 'password_confirmation' => 'MotDePasse123',
    ])->assertStatus(422);
});

// ---------- Renvoi du lien depuis « Utilisateurs » ----------

test('la liste des utilisateurs signale qui attend son mot de passe, et le lien peut être renvoyé', function () {
    $request = verifiedRequest();
    $admin = sessionAdmin();
    Sanctum::actingAs($admin);
    $this->postJson("/api/account-requests/{$request->id}/validate")->assertOk();
    $user = $request->fresh()->createdUser;
    $done = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'password_set_at' => now()]);

    $rows = collect($this->getJson('/api/users')->assertOk()->json('data'))->keyBy('id');
    expect($rows[$user->id]['awaiting_password'])->toBeTrue()
        ->and($rows[$done->id]['awaiting_password'])->toBeFalse();

    $before = $request->fresh()->setup_token_hash;
    $this->postJson("/api/users/{$user->id}/resend-setup-link")->assertOk();
    expect($request->fresh()->setup_token_hash)->not->toBe($before);

    // Mot de passe déjà créé : plus de renvoi possible.
    $this->postJson("/api/users/{$done->id}/resend-setup-link")->assertStatus(422);
});

test('un compte réactivé est actif et son lien peut être renvoyé', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => false, 'password_set_at' => now()]);
    Sanctum::actingAs(sessionAdmin());

    $this->postJson("/api/users/{$user->id}/reactivate")->assertOk()->assertJsonPath('awaiting_password', true);
    expect($user->fresh()->is_active)->toBeTrue()
        ->and(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeTrue();

    $this->postJson("/api/users/{$user->id}/resend-setup-link")->assertOk();
});

test('le renvoi du lien depuis « Utilisateurs » est réservé à l\'administrateur', function () {
    $user = User::factory()->create(['role' => 'etudiant']);
    Sanctum::actingAs(sessionLibrarian());

    $this->postJson("/api/users/{$user->id}/resend-setup-link")->assertForbidden();
});

// ---------- Traitements groupés ----------

test('l\'administrateur valide seulement les demandes sélectionnées', function () {
    [$a, $b, $c] = [verifiedRequest(), verifiedRequest(), verifiedRequest()];
    Sanctum::actingAs(sessionAdmin());

    $this->postJson('/api/account-requests/validate-all', ['ids' => [$a->id, $b->id]])
        ->assertOk()->assertJsonPath('validated_count', 2);

    expect($a->fresh()->status)->toBe('validee')
        ->and($b->fresh()->status)->toBe('validee')
        ->and($c->fresh()->status)->toBe('verifiee');
});

test('le rejet groupé exige un motif et rejette les demandes sélectionnées', function () {
    [$a, $b] = [verifiedRequest(), verifiedRequest()];
    Sanctum::actingAs(sessionAdmin());

    $this->postJson('/api/account-requests/reject-all', ['ids' => [$a->id]])->assertStatus(422);
    $this->postJson('/api/account-requests/reject-all', ['ids' => [$a->id], 'reason' => 'Dossier incomplet'])
        ->assertOk()->assertJsonPath('rejected_count', 1);

    expect($a->fresh()->status)->toBe('rejetee')
        ->and($a->fresh()->rejection_reason)->toBe('Dossier incomplet')
        ->and($b->fresh()->status)->toBe('verifiee');
});

test('le Service Numérique vérifie en groupe, mais ne peut ni valider ni rejeter en groupe', function () {
    $pending = AccountRequest::factory()->create(['status' => 'en_attente', 'library_id' => Library::factory()->create()->id]);
    $other = AccountRequest::factory()->create(['status' => 'en_attente', 'library_id' => Library::factory()->create()->id]);
    Sanctum::actingAs(sessionLibrarian());

    $this->postJson('/api/account-requests/verify-all', ['ids' => [$pending->id]])
        ->assertOk()->assertJsonPath('verified_count', 1);
    expect($pending->fresh()->status)->toBe('verifiee')
        ->and($other->fresh()->status)->toBe('en_attente');

    $this->postJson('/api/account-requests/validate-all', ['ids' => [$other->id]])->assertForbidden();
    $this->postJson('/api/account-requests/reject-all', ['ids' => [$other->id], 'reason' => 'x'])->assertForbidden();
});

test('un membre ne peut lancer aucun traitement groupé', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->postJson('/api/account-requests/verify-all', ['ids' => [1]])->assertForbidden();
    $this->postJson('/api/account-requests/validate-all', ['ids' => [1]])->assertForbidden();
});

// ---------- Numéro de demande ----------

test('le numéro de demande suit le format REQ-compteur-établissement-année', function () {
    $year = now()->year;

    expect(AccountRequestRules::establishmentCode('Faculté de Médecine'))->toBe('FM')
        ->and(AccountRequestRules::establishmentCode("Faculté des sciences, technologies et de l'environnement (FSTE)"))->toBe('FSTE')
        ->and(AccountRequestRules::establishmentCode('Ecoles et formations rattachées'))->toBe('EFR')
        ->and(AccountRequestRules::establishmentCode('IOSTM'))->toBe('IOSTM')
        ->and(AccountRequestRules::newRequestNumber(['school' => 'IOSTM', 'role' => 'etudiant']))->toBe("REQ-0001-IOSTM-{$year}")
        ->and(AccountRequestRules::newRequestNumber(['role' => 'enseignant']))->toBe("REQ-0001-ENS-{$year}");

    AccountRequest::factory()->create(['request_number' => "REQ-0041-FM-{$year}"]);
    expect(AccountRequestRules::newRequestNumber(['school' => 'IUGM']))->toBe("REQ-0042-IUGM-{$year}");
});

// ---------- Avis / signalements : filtre par carte ----------

test('les signalements se filtrent par statut, sans changer les compteurs', function () {
    $user = User::factory()->create(['role' => 'etudiant']);
    foreach (['nouveau', 'nouveau', 'en_cours', 'traite'] as $status) {
        ProblemReport::create(['user_id' => $user->id, 'type' => 'autre', 'subject' => 'Sujet', 'description' => 'Texte', 'status' => $status]);
    }
    Sanctum::actingAs(sessionAdmin());

    $response = $this->getJson('/api/problem-reports?status=nouveau')->assertOk();
    expect($response->json('total'))->toBe(2)
        ->and($response->json('counts'))->toMatchArray(['total' => 4, 'nouveau' => 2, 'en_cours' => 1, 'traite' => 1]);
});

// ---------- Balayage : aucune route GET ne renvoie d'erreur serveur ----------

test('aucune route GET de l\'API ne provoque d\'erreur 500, quel que soit le rôle', function () {
    $library = Library::factory()->create();
    $users = [
        'visiteur' => null,
        'administrateur' => sessionAdmin(),
        'bibliothecaire' => sessionLibrarian(),
        'etudiant' => User::factory()->create(['role' => 'etudiant', 'is_active' => true]),
        'chercheur' => User::factory()->create(['role' => 'chercheur', 'is_active' => true]),
    ];

    $uris = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($route) => in_array('GET', $route->methods(), true) && str_starts_with($route->uri(), 'api/'))
        ->map(fn ($route) => '/' . $route->uri())
        // Paramètres de route : un identifiant existant quand c'est simple, sinon une valeur quelconque (404 attendu).
        ->map(fn ($uri) => preg_replace(['/\{library\}/', '/\{[^}]+\}/'], [(string) $library->id, '1'], $uri))
        ->reject(fn ($uri) => str_contains($uri, 'stream')) // flux de fichier PDF, testé ailleurs
        ->unique()
        ->values();

    $errors = [];
    foreach ($users as $role => $user) {
        $this->app['auth']->forgetGuards();
        if ($user) {
            Sanctum::actingAs($user);
        }
        foreach ($uris as $uri) {
            $status = $this->getJson($uri)->status();
            if ($status >= 500) {
                $errors[] = "{$role} GET {$uri} → {$status}";
            }
        }
    }

    expect($errors)->toBe([]);
});
