<?php

// Création de comptes : chaque parcours envoie réellement un e-mail contenant un lien de création
// du mot de passe qui fonctionne ; un échec d'envoi est signalé (jamais « e-mail envoyé » à tort)
// et le lien peut être renvoyé.

use App\Models\AccountRequest;
use App\Models\AppNotification;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\Mime\Email;

/** E-mails réellement produits (transport « array » : rendu complet, sans envoi réseau). */
function sentMails(): array
{
    return array_map(
        fn ($sent) => $sent->getOriginalMessage(),
        iterator_to_array(app('mailer')->getSymfonyTransport()->messages()),
    );
}

function lastMailTo(string $email): ?Email
{
    $mails = array_values(array_filter(sentMails(), fn (Email $m) => $m->getTo()[0]->getAddress() === $email));

    return end($mails) ?: null;
}

/** Lien du bouton de l'e-mail (création du mot de passe). */
function setupLinkIn(Email $mail): string
{
    preg_match('#https?://[^"\s<]+(?:creer-mot-de-passe|reinitialiser-mot-de-passe)\?[^"\s<]+#', $mail->getHtmlBody(), $m);
    expect($m)->not->toBeEmpty();

    return html_entity_decode($m[0]);
}

function setupAdmin(): User
{
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Sanctum::actingAs($admin);

    return $admin;
}

function memberPayload(string $role, string $email): array
{
    $base = [
        'last_name' => 'Rakoto', 'first_name' => 'Jean', 'email' => $email, 'phone' => '0340000000',
        'address' => 'Mahajanga', 'gender' => 'masculin', 'date_of_birth' => '1990-05-10', 'role' => $role,
    ];

    return $base + match ($role) {
        'etudiant' => ['birth_place' => 'Mahajanga', 'student_card_number' => 'CARTE-1', 'school' => 'IOSTM', 'filiere' => 'Informatique', 'niveau_type' => 'Université', 'niveau_detail' => 'L1', 'cin_number' => '123456789012', 'cin_issued_at' => '2015-01-10'],
        'enseignant' => ['faculty' => 'Faculté de Droit', 'teaching_specialty' => 'Droit des affaires'],
        'chercheur' => ['faculty' => 'IOSTM', 'researcher_field' => 'Océanographie', 'specialty' => 'Courants marins'],
    };
}

/** Utilise le lien reçu pour créer le mot de passe, puis se connecte. */
function completeSetup(string $link, string $email): void
{
    parse_str(parse_url($link, PHP_URL_QUERY), $query);
    auth()->forgetGuards();

    if (str_contains($link, 'creer-mot-de-passe')) {
        test()->postJson('/api/account-requests/setup/'.urlencode($query['token']), ['password' => 'MotDePasse123', 'password_confirmation' => 'MotDePasse123'])->assertSuccessful();
    } else {
        test()->postJson('/api/reset-password', ['email' => $query['email'], 'token' => $query['token'], 'password' => 'MotDePasse123', 'password_confirmation' => 'MotDePasse123'])->assertSuccessful();
    }

    auth()->forgetGuards();
    test()->postJson('/api/login', ['email' => $email, 'password' => 'MotDePasse123'])->assertOk();
}

beforeEach(function () {
    config(['mail.default' => 'array']);
});

it('l\'administrateur crée un compte : e-mail avec un lien qui fonctionne', function (string $role) {
    setupAdmin();
    $email = "{$role}@example.test";

    $this->postJson('/api/users/creer', memberPayload($role, $email))
        ->assertCreated()
        ->assertJsonPath('mail_sent', true)
        ->assertJsonPath('message', fn ($m) => str_contains($m, $email));

    $mail = lastMailTo($email);
    expect($mail)->not->toBeNull();
    completeSetup(setupLinkIn($mail), $email);

    expect(User::where('email', $email)->first()->is_active)->toBeTrue();
})->with(['etudiant', 'enseignant', 'chercheur']);

it('l\'administrateur crée un bibliothécaire : e-mail avec un lien qui fonctionne', function () {
    setupAdmin();

    $this->postJson('/api/librarians', [
        'last_name' => 'Rasoa', 'first_name' => 'Lala', 'email' => 'biblio.new@example.test', 'phone' => '0340000001',
        'address' => 'Mahajanga', 'gender' => 'feminin', 'cin_number' => '123456789012', 'cin_issued_at' => '2015-01-10',
    ])->assertCreated()->assertJsonPath('mail_sent', true);

    completeSetup(setupLinkIn(lastMailTo('biblio.new@example.test')), 'biblio.new@example.test');
});

it('demande publique vérifiée puis validée : e-mail avec un lien qui fonctionne', function () {
    auth()->forgetGuards();
    $this->postJson('/api/account-requests', memberPayload('etudiant', 'public.new@example.test') + ['niveau_type' => 'Université'])->assertSuccessful();
    $request = AccountRequest::where('email', 'public.new@example.test')->firstOrFail();

    setupAdmin();
    if ($request->status === 'en_attente') {
        $this->postJson("/api/account-requests/{$request->id}/verify")->assertSuccessful();
    }
    $this->postJson("/api/account-requests/{$request->id}/validate")->assertSuccessful();

    completeSetup(setupLinkIn(lastMailTo('public.new@example.test')), 'public.new@example.test');
});

it('demande du bibliothécaire validée par l\'administrateur : e-mail avec un lien qui fonctionne', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
    $librarian->permissions()->attach(Permission::where('name', 'ajouter_utilisateur')->firstOrFail()->id);
    Sanctum::actingAs($librarian);
    $this->postJson('/api/account-requests/by-librarian', memberPayload('etudiant', 'par.biblio@example.test'))->assertSuccessful();
    $request = AccountRequest::where('email', 'par.biblio@example.test')->firstOrFail();

    setupAdmin();
    if ($request->fresh()->status === 'en_attente') {
        $this->postJson("/api/account-requests/{$request->id}/verify")->assertSuccessful();
    }
    $this->postJson("/api/account-requests/{$request->id}/validate")->assertSuccessful();

    completeSetup(setupLinkIn(lastMailTo('par.biblio@example.test')), 'par.biblio@example.test');
});

it('renvoie le lien d\'un compte créé : seul le nouveau lien fonctionne', function () {
    setupAdmin();
    $this->postJson('/api/users/creer', memberPayload('chercheur', 'renvoi@example.test'))->assertCreated();
    $firstLink = setupLinkIn(lastMailTo('renvoi@example.test'));
    $request = AccountRequest::where('email', 'renvoi@example.test')->firstOrFail();

    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")
        ->assertOk()
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'renvoi@example.test'));
    $newLink = setupLinkIn(lastMailTo('renvoi@example.test'));
    expect($newLink)->not->toBe($firstLink);

    parse_str(parse_url($firstLink, PHP_URL_QUERY), $old);
    $this->postJson('/api/account-requests/setup/'.urlencode($old['token']), ['password' => 'MotDePasse123', 'password_confirmation' => 'MotDePasse123'])->assertNotFound(); // ancien lien invalidé
    completeSetup($newLink, 'renvoi@example.test');
});

it('renvoie le lien d\'un bibliothécaire qui n\'a pas encore créé son mot de passe', function () {
    setupAdmin();
    $this->postJson('/api/librarians', [
        'last_name' => 'Rabe', 'email' => 'lib.renvoi@example.test', 'phone' => '0340000002', 'address' => 'Mahajanga',
        'gender' => 'masculin', 'cin_number' => '123456789012', 'cin_issued_at' => '2015-01-10',
    ])->assertCreated();
    $librarian = User::where('email', 'lib.renvoi@example.test')->firstOrFail();

    $this->postJson("/api/librarians/{$librarian->id}/resend-setup-link")->assertOk();
    completeSetup(setupLinkIn(lastMailTo('lib.renvoi@example.test')), 'lib.renvoi@example.test');

    // Mot de passe déjà créé : plus de renvoi.
    setupAdmin();
    $this->postJson("/api/librarians/{$librarian->id}/resend-setup-link")->assertStatus(422);
});

it('réserve le renvoi du lien d\'un bibliothécaire à l\'administrateur', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'password_set_at' => null]);
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]));

    $this->postJson("/api/librarians/{$librarian->id}/resend-setup-link")->assertForbidden();
});

describe('serveur de messagerie injoignable', function () {
    beforeEach(function () {
        // Port fermé : la connexion SMTP échoue immédiatement, comme lors d'une coupure réseau.
        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
            'mail.mailers.smtp.timeout' => 2,
        ]);
    });

    it('signale l\'échec à la création par l\'administrateur (le compte reste créé)', function () {
        setupAdmin();

        $this->postJson('/api/users/creer', memberPayload('chercheur', 'echec@example.test'))
            ->assertCreated()
            ->assertJsonPath('mail_sent', false)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'n’a pas pu être envoyé') && str_contains($m, 'Renvoyer le lien'));

        expect(User::where('email', 'echec@example.test')->exists())->toBeTrue();
    });

    it('signale l\'échec à la création d\'un bibliothécaire', function () {
        setupAdmin();

        $this->postJson('/api/librarians', [
            'last_name' => 'Rabe', 'email' => 'lib.echec@example.test', 'phone' => '0340000003', 'address' => 'Mahajanga',
            'gender' => 'masculin', 'cin_number' => '123456789012', 'cin_issued_at' => '2015-01-10',
        ])->assertCreated()->assertJsonPath('mail_sent', false);
    });

    it('renvoie une erreur claire quand le renvoi du lien échoue', function () {
        setupAdmin();
        config(['mail.default' => 'array']);
        $this->postJson('/api/users/creer', memberPayload('chercheur', 'renvoi.echec@example.test'))->assertCreated();
        config(['mail.default' => 'smtp']);
        $request = AccountRequest::where('email', 'renvoi.echec@example.test')->firstOrFail();

        $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")
            ->assertStatus(503)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'injoignable'));
    });

    it('prévient l\'administrateur si le lien d\'une demande validée n\'a pas pu partir', function () {
        auth()->forgetGuards();
        config(['mail.default' => 'array']);
        $this->postJson('/api/account-requests', memberPayload('etudiant', 'valide.echec@example.test'))->assertSuccessful();
        $request = AccountRequest::where('email', 'valide.echec@example.test')->firstOrFail();

        $admin = setupAdmin();
        if ($request->status === 'en_attente') {
            $this->postJson("/api/account-requests/{$request->id}/verify")->assertSuccessful();
        }
        config(['mail.default' => 'smtp']);
        $this->postJson("/api/account-requests/{$request->id}/validate")->assertSuccessful();

        expect(AppNotification::where('user_id', $admin->id)->where('type', 'envoi_email_echoue')->exists())->toBeTrue();
    });
});

it('un compte supprimé définitivement (ancienne donnée) : renvoi refusé avec un message clair et demande retirée', function () {
    setupAdmin();
    $this->postJson('/api/users/creer', memberPayload('etudiant', 'supprime@example.test'))->assertCreated();
    $request = AccountRequest::where('email', 'supprime@example.test')->firstOrFail();
    // Suppression définitive faite « à l'ancienne » (données existantes) : la clé étrangère vide created_user_id.
    User::where('email', 'supprime@example.test')->firstOrFail()->forceDelete();

    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'supprimé définitivement'));

    expect(AccountRequest::find($request->id))->toBeNull();
});

it('un compte dans la Corbeille : sa demande est masquée de la liste et le renvoi indique de le restaurer', function () {
    setupAdmin();
    $this->postJson('/api/users/creer', memberPayload('etudiant', 'corbeille@example.test'))->assertCreated();
    $request = AccountRequest::where('email', 'corbeille@example.test')->firstOrFail();
    $user = User::where('email', 'corbeille@example.test')->firstOrFail();
    $user->delete();
    $mailsBefore = count(sentMails());

    expect(collect($this->getJson('/api/account-requests')->json('data'))->pluck('id'))->not->toContain($request->id);

    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'Corbeille'));
    expect(count(sentMails()))->toBe($mailsBefore);

    // Restauré : la demande réapparaît.
    $this->postJson("/api/trash/users/{$user->id}/restore")->assertOk();
    expect(collect($this->getJson('/api/account-requests')->json('data'))->pluck('id'))->toContain($request->id);
});

it('vider la Corbeille ou supprimer définitivement un compte retire aussi sa demande', function () {
    setupAdmin();
    foreach (['vidage@example.test', 'unitaire@example.test'] as $email) {
        $this->postJson('/api/users/creer', memberPayload('etudiant', $email))->assertCreated();
        User::where('email', $email)->firstOrFail()->delete();
    }

    $this->deleteJson('/api/trash/users/' . User::onlyTrashed()->where('email', 'unitaire@example.test')->value('id'))->assertOk();
    $this->deleteJson('/api/trash')->assertOk();

    expect(AccountRequest::whereIn('email', ['vidage@example.test', 'unitaire@example.test'])->count())->toBe(0);
});

it('la migration retire les demandes des comptes déjà supprimés définitivement, pas les autres', function () {
    setupAdmin();
    $this->postJson('/api/users/creer', memberPayload('etudiant', 'orphelin@example.test'))->assertCreated();
    User::where('email', 'orphelin@example.test')->firstOrFail()->forceDelete();
    $pending = AccountRequest::factory()->create(['status' => 'expiree', 'matricule' => null, 'created_user_id' => null]);

    (require database_path('migrations/2026_09_26_000001_delete_account_requests_of_permanently_deleted_accounts.php'))->up();

    expect(AccountRequest::where('email', 'orphelin@example.test')->exists())->toBeFalse()
        ->and(AccountRequest::find($pending->id))->not->toBeNull();
});

it("l'administrateur valide directement une demande non validée, sans l'étape « Vérifier »", function () {
    setupAdmin();
    $request = AccountRequest::factory()->create(['status' => 'en_attente', 'email' => 'direct@example.test', 'expires_at' => now()->addDay(), 'validation_deadline_at' => now()->addDay()]);

    $this->postJson("/api/account-requests/{$request->id}/validate")->assertSuccessful();

    expect($request->fresh()->status)->toBe('validee')
        ->and(User::where('email', 'direct@example.test')->exists())->toBeTrue();
    completeSetup(setupLinkIn(lastMailTo('direct@example.test')), 'direct@example.test');
});

it('le bibliothécaire garde le parcours inchangé : il vérifie, il ne valide pas', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]));
    $request = AccountRequest::factory()->create(['status' => 'en_attente', 'expires_at' => now()->addDay(), 'validation_deadline_at' => now()->addDay()]);

    $this->postJson("/api/account-requests/{$request->id}/validate")->assertForbidden();
    $this->postJson("/api/account-requests/{$request->id}/verify")->assertSuccessful();

    expect($request->fresh()->status)->toBe('verifiee');
});

it('« Valider toutes les demandes » valide aussi les demandes non validées', function () {
    setupAdmin();
    $pending = AccountRequest::factory()->create(['status' => 'en_attente', 'expires_at' => now()->addDay(), 'validation_deadline_at' => now()->addDay()]);
    $verified = AccountRequest::factory()->create(['status' => 'verifiee', 'expires_at' => now()->addDay(), 'validation_deadline_at' => now()->addDay()]);

    $this->postJson('/api/account-requests/validate-all')->assertOk()->assertJsonPath('validated_count', 2);

    expect($pending->fresh()->status)->toBe('validee')->and($verified->fresh()->status)->toBe('validee');
});
