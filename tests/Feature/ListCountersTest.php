<?php

// Compteurs des listes d'administration : « Total » + un nombre par état réellement existant.
// Chaque compteur doit porter sur EXACTEMENT les mêmes données que la liste (même périmètre).

use App\Models\AccountRequest;
use App\Models\Feedback;
use App\Models\Library;
use App\Models\Permission;
use App\Models\ProblemReport;
use App\Models\User;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

function counterAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

function counterLibrarian(Library $library, array $permissions = []): User
{
    $user = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id]);
    foreach ($permissions as $name) {
        $user->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
    }

    return $user;
}

function requestsIn(Library $library, array $byStatus): void
{
    foreach ($byStatus as $status => $count) {
        // « compte_active » n'est pas un statut stocké : c'est « validee » dont le jeton d'initialisation a été effacé.
        $attributes = $status === 'compte_active'
            ? ['status' => 'validee', 'setup_token_hash' => null]
            : ['status' => $status, 'setup_token_hash' => $status === 'validee' ? 'hash' : null];
        AccountRequest::factory()->count($count)->create($attributes + ['library_id' => $library->id]);
    }
}

// ---------- Comptes à valider / Demandes de compte ----------

test('l\'administrateur reçoit le total et chaque statut, toutes bibliothèques confondues', function () {
    $a = Library::factory()->create();
    $b = Library::factory()->create();
    requestsIn($a, ['en_attente' => 3, 'verifiee' => 2, 'validee' => 1, 'compte_active' => 1]);
    requestsIn($b, ['en_attente' => 2, 'rejetee' => 2, 'expiree' => 1, 'traitee' => 1]);
    Sanctum::actingAs(counterAdmin());

    $counts = $this->getJson('/api/account-requests')->assertOk()->json('counts');

    expect($counts)->toBe([
        // Une demande validée donne un compte actif : « validee » est compté dans « compte_active ».
        'total' => 13, 'en_attente' => 5, 'verifiee' => 2, 'compte_active' => 2, 'rejetee' => 2, 'expiree' => 1, 'traitee' => 1,
    ]);
});

test('les compteurs ne changent pas avec le filtre de statut et la liste correspond à chaque compteur', function () {
    $library = Library::factory()->create();
    requestsIn($library, ['en_attente' => 4, 'verifiee' => 2, 'validee' => 2, 'compte_active' => 3]);
    Sanctum::actingAs(counterAdmin());

    $all = $this->getJson('/api/account-requests')->json('counts');
    foreach (['en_attente', 'verifiee', 'compte_active'] as $status) {
        $response = $this->getJson("/api/account-requests?status={$status}")->assertOk();
        expect($response->json('counts'))->toBe($all)                    // le filtre ne modifie pas les compteurs
            ->and($response->json('total'))->toBe($all[$status]);         // et chaque compteur = nombre de lignes de la liste
    }
});

test('toute demande validée est un « compte activé », mot de passe créé ou non', function () {
    $library = Library::factory()->create();
    $pending = AccountRequest::factory()->create(['status' => 'validee', 'setup_token_hash' => 'hash', 'library_id' => $library->id]);
    $activated = AccountRequest::factory()->create(['status' => 'validee', 'setup_token_hash' => null, 'library_id' => $library->id]);
    Sanctum::actingAs(counterAdmin());

    $ids = collect([$pending->id, $activated->id])->sort()->values()->all();
    expect(collect($this->getJson('/api/account-requests?status=compte_active')->json('data'))->pluck('id')->sort()->values()->all())->toBe($ids)
        ->and(collect($this->getJson('/api/account-requests?status=validee')->json('data'))->pluck('id')->sort()->values()->all())->toBe($ids)
        ->and($this->getJson('/api/account-requests')->json('counts.compte_active'))->toBe(2);
});

test('le bibliothécaire voit et compte désormais les demandes de toutes les bibliothèques (Bibliothèque Numérique Globale)', function () {
    $mine = Library::factory()->create();
    $other = Library::factory()->create();
    requestsIn($mine, ['en_attente' => 2, 'verifiee' => 1, 'rejetee' => 1]);
    requestsIn($other, ['en_attente' => 5, 'verifiee' => 4, 'expiree' => 3]);
    Sanctum::actingAs(counterLibrarian($mine));

    $response = $this->getJson('/api/account-requests')->assertOk();

    expect($response->json('counts'))->toMatchArray(['total' => 16, 'en_attente' => 7, 'verifiee' => 5, 'rejetee' => 1, 'expiree' => 3])
        ->and($response->json('total'))->toBe(16)
        ->and(collect($response->json('data'))->pluck('library_id')->unique()->sort()->values()->all())->toBe(collect([$mine->id, $other->id])->sort()->values()->all());

    // Un library_id demandé dans l'URL ne change ni la liste ni les compteurs (paramètre non pris en charge ici).
    expect($this->getJson("/api/account-requests?library_id={$other->id}")->json('counts.total'))->toBe(16);

    // Un bibliothécaire sans bibliothèque (compte global) : voit aussi tout, sans erreur.
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]));
    expect($this->getJson('/api/account-requests')->assertOk()->json('counts.total'))->toBe(16);

    // Un étudiant n'accède à rien (RBAC, inchangé).
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));
    $this->getJson('/api/account-requests')->assertForbidden();
});

test('les compteurs suivent une vérification, un rejet et une expiration', function () {
    $library = Library::factory()->create();
    $librarian = counterLibrarian($library);
    $toVerify = AccountRequest::factory()->create(['status' => 'en_attente', 'library_id' => $library->id]);
    $toReject = AccountRequest::factory()->create(['status' => 'en_attente', 'library_id' => $library->id]);
    AccountRequest::factory()->create(['status' => 'en_attente', 'library_id' => $library->id, 'expires_at' => now()->subHour()]);
    Sanctum::actingAs($librarian);

    // L'expiration est appliquée avant le calcul : la demande périmée est déjà comptée « Expirée ».
    expect($this->getJson('/api/account-requests')->json('counts'))->toMatchArray(['total' => 3, 'en_attente' => 2, 'expiree' => 1]);

    $this->postJson("/api/account-requests/{$toVerify->id}/verify")->assertOk();
    expect($this->getJson('/api/account-requests')->json('counts'))->toMatchArray(['total' => 3, 'en_attente' => 1, 'verifiee' => 1, 'expiree' => 1]);

    $this->postJson("/api/account-requests/{$toReject->id}/reject", ['reason' => 'incomplet'])->assertOk();
    expect($this->getJson('/api/account-requests')->json('counts'))->toMatchArray(['total' => 3, 'en_attente' => 0, 'verifiee' => 1, 'rejetee' => 1, 'expiree' => 1]);
});

test('la validation par l\'administrateur déplace la demande de « Vérifiée » vers « Compte activé »', function () {
    $library = Library::factory()->create();
    $toValidate = AccountRequest::factory()->create(['status' => 'verifiee', 'library_id' => $library->id, 'validation_deadline_at' => now()->addDay()]);
    AccountRequest::factory()->create(['status' => 'verifiee', 'library_id' => $library->id, 'validation_deadline_at' => now()->addDay()]);
    AccountRequest::factory()->create(['status' => 'en_attente', 'library_id' => $library->id]);
    Sanctum::actingAs(counterAdmin());

    expect($this->getJson('/api/account-requests')->json('counts'))->toMatchArray(['total' => 3, 'en_attente' => 1, 'verifiee' => 2, 'compte_active' => 0]);

    $this->postJson("/api/account-requests/{$toValidate->id}/validate")->assertOk();

    expect($this->getJson('/api/account-requests')->json('counts'))->toMatchArray(['total' => 3, 'en_attente' => 1, 'verifiee' => 1, 'compte_active' => 1]);

    // Le mot de passe est ensuite créé : la demande reste « compte activé » (total inchangé).
    $token = 'jeton-de-test-' . Str::random(20);
    $toValidate->fresh()->update(['setup_token_hash' => \Illuminate\Support\Facades\Hash::make($token), 'setup_expires_at' => now()->addHour()]);
    $this->postJson("/api/account-requests/setup/{$token}", ['password' => 'MotDePasse123', 'password_confirmation' => 'MotDePasse123'])->assertOk();

    expect($this->getJson('/api/account-requests')->json('counts'))->toMatchArray(['total' => 3, 'compte_active' => 1]);

    // Le compte créé est actif, et le registre des membres le reflète.
    $user = $toValidate->fresh()->createdUser;
    expect($user->is_active)->toBeTrue()
        ->and($user->password_set_at)->not->toBeNull()
        ->and(\App\Models\MemberRegistry::where('user_id', $user->id)->value('status'))->toBe('actif');
});

test('aucune demande : Total 0 et tous les compteurs à zéro, sans erreur', function () {
    Sanctum::actingAs(counterAdmin());

    expect($this->getJson('/api/account-requests')->assertOk()->json('counts'))->toBe([
        'total' => 0, 'en_attente' => 0, 'verifiee' => 0, 'compte_active' => 0, 'rejetee' => 0, 'expiree' => 0, 'traitee' => 0,
    ]);
});

// ---------- Utilisateurs ----------

test('les utilisateurs : total, rôles, états — corbeille exclue, bibliothécaires et administrateurs hors total', function () {
    $library = Library::factory()->create();
    User::factory()->count(3)->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $library->id]);
    User::factory()->count(2)->create(['role' => 'etudiant', 'is_active' => false, 'library_id' => $library->id]);
    User::factory()->count(2)->create(['role' => 'enseignant', 'is_active' => true]);
    User::factory()->create(['role' => 'chercheur', 'is_active' => true]);
    User::factory()->create(['role' => 'etudiant', 'is_active' => true])->delete(); // corbeille : jamais comptée
    counterLibrarian($library);
    counterLibrarian($library);
    Sanctum::actingAs(counterAdmin());

    $response = $this->getJson('/api/users')->assertOk();
    $counts = $response->json('counts');

    expect($counts)->toBe([
        'total' => 8, 'etudiant' => 5, 'enseignant' => 2, 'chercheur' => 1, 'actifs' => 6, 'inactifs' => 2,
        'hors_total' => ['bibliothecaire' => 2, 'administrateur' => 1],
    ])->and($response->json('total'))->toBe(8); // le total affiché = le nombre de lignes de la liste

    // Les filtres de rôle / d'état ne modifient pas les compteurs, la recherche oui.
    expect($this->getJson('/api/users?role=etudiant&is_active=1')->json('counts'))->toBe($counts)
        ->and($this->getJson('/api/users?search=zzzintrouvable')->json('counts.total'))->toBe(0);
});

test('aucun utilisateur : Total 0 sans erreur ; réservé à l\'administrateur', function () {
    Sanctum::actingAs(counterAdmin());
    expect($this->getJson('/api/users')->assertOk()->json('counts'))->toMatchArray(['total' => 0, 'etudiant' => 0, 'actifs' => 0, 'inactifs' => 0]);

    Sanctum::actingAs(counterLibrarian(Library::factory()->create()));
    $this->getJson('/api/users')->assertForbidden();
});

test('les compteurs utilisateurs suivent une désactivation, une réactivation et une suppression', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    Sanctum::actingAs(counterAdmin());

    $this->postJson("/api/users/{$student->id}/deactivate", ['reason' => 'test'])->assertOk();
    expect($this->getJson('/api/users')->json('counts'))->toMatchArray(['total' => 2, 'actifs' => 1, 'inactifs' => 1]);

    $this->deleteJson("/api/users/{$student->id}", ['reason' => 'test'])->assertOk();
    expect($this->getJson('/api/users')->json('counts'))->toMatchArray(['total' => 1, 'etudiant' => 1, 'actifs' => 1, 'inactifs' => 0]);
});

// ---------- Avis et signalements ----------

test('avis : total et statuts existants (nouveau, lu, traité)', function () {
    $author = User::factory()->create(['role' => 'etudiant']);
    foreach (['nouveau', 'nouveau', 'lu', 'traite', 'traite', 'traite'] as $status) {
        Feedback::create(['uuid' => (string) Str::uuid(), 'user_id' => $author->id, 'type' => 'suggestion', 'subject' => 'S', 'message' => 'M', 'rating' => 4, 'status' => $status]);
    }
    Sanctum::actingAs(counterAdmin());

    $response = $this->getJson('/api/feedbacks')->assertOk();

    expect($response->json('counts'))->toBe(['total' => 6, 'nouveau' => 2, 'lu' => 1, 'traite' => 3])->and($response->json('total'))->toBe(6);
});

test('signalements : total et statuts existants (nouveau, en cours, traité)', function () {
    $author = User::factory()->create(['role' => 'etudiant']);
    foreach (['nouveau', 'en_cours', 'en_cours', 'traite'] as $status) {
        ProblemReport::create(['uuid' => (string) Str::uuid(), 'user_id' => $author->id, 'type' => 'bug', 'subject' => 'S', 'description' => 'D', 'status' => $status]);
    }
    Sanctum::actingAs(counterAdmin());

    expect($this->getJson('/api/problem-reports')->assertOk()->json('counts'))->toBe(['total' => 4, 'nouveau' => 1, 'en_cours' => 2, 'traite' => 1]);
});

test('avis et signalements : aucun élément donne Total 0 ; le bibliothécaire compte désormais les membres de toutes les bibliothèques (Bibliothèque Numérique Globale)', function () {
    Sanctum::actingAs(counterAdmin());
    expect($this->getJson('/api/feedbacks')->assertOk()->json('counts'))->toBe(['total' => 0, 'nouveau' => 0, 'lu' => 0, 'traite' => 0])
        ->and($this->getJson('/api/problem-reports')->assertOk()->json('counts'))->toBe(['total' => 0, 'nouveau' => 0, 'en_cours' => 0, 'traite' => 0]);

    $mine = Library::factory()->create();
    $other = Library::factory()->create();
    $mineStudent = User::factory()->create(['role' => 'etudiant', 'library_id' => $mine->id]);
    $otherStudent = User::factory()->create(['role' => 'etudiant', 'library_id' => $other->id]);
    foreach ([[$mineStudent, 'nouveau'], [$otherStudent, 'nouveau'], [$otherStudent, 'traite']] as [$user, $status]) {
        Feedback::create(['uuid' => (string) Str::uuid(), 'user_id' => $user->id, 'type' => 'suggestion', 'subject' => 'S', 'message' => 'M', 'rating' => 3, 'status' => $status]);
        ProblemReport::create(['uuid' => (string) Str::uuid(), 'user_id' => $user->id, 'type' => 'bug', 'subject' => 'S', 'description' => 'D', 'status' => $status]);
    }

    Sanctum::actingAs(counterLibrarian($mine, ['voir_avis_utilisateurs', 'voir_signalements']));
    expect($this->getJson('/api/feedbacks')->json('counts'))->toBe(['total' => 3, 'nouveau' => 2, 'lu' => 0, 'traite' => 1])
        ->and($this->getJson('/api/problem-reports')->json('counts'))->toBe(['total' => 3, 'nouveau' => 2, 'en_cours' => 0, 'traite' => 1]);

    // Sans la permission, aucun accès (donc aucun compteur).
    Sanctum::actingAs(counterLibrarian($mine));
    $this->getJson('/api/feedbacks')->assertForbidden();
});

test('les réponses de liste existantes restent compatibles : pagination et données inchangées', function () {
    $library = Library::factory()->create();
    requestsIn($library, ['en_attente' => 25]);
    Sanctum::actingAs(counterAdmin());

    $json = $this->getJson('/api/account-requests?status=en_attente')->assertOk()->json();

    expect($json['data'])->toHaveCount(20)->and($json['total'])->toBe(25)->and($json['last_page'])->toBe(2)->and($json['counts']['en_attente'])->toBe(25);
});
