<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

const RESET_NOT_FOUND = 'Cette adresse e-mail n’a pas de compte.';
const RESET_DISABLED = 'Votre compte est désactivé.';
const RESET_SENT = 'Un lien de réinitialisation de votre mot de passe a été envoyé à cette adresse e-mail.';

function resetMails(): array
{
    return collect(Mail::mailer('array')->getSymfonyTransport()->messages())
        ->map(fn ($sent) => $sent->getOriginalMessage())
        ->all();
}

// Extrait le jeton du lien de réinitialisation contenu dans le dernier e-mail envoyé.
function resetTokenFromLastMail(): string
{
    $mails = resetMails();
    preg_match('/href="([^"]*reinitialiser-mot-de-passe[^"]*)"/', end($mails)->getHtmlBody(), $m);
    parse_str(parse_url(html_entity_decode($m[1]), PHP_URL_QUERY), $query);

    return $query['token'];
}

function resetUser(array $attributes = []): User
{
    return User::factory()->create(array_merge([
        'role' => 'etudiant',
        'is_active' => true,
        'password_set_at' => now()->subDay(),
        'password' => 'ancien-mot-de-passe',
    ], $attributes));
}

function expectNoResetSent(string $email): void
{
    expect(DB::table('password_reset_tokens')->count())->toBe(0)
        ->and(resetMails())->toBeEmpty();
}

// ---------- TEST 1 : compte actif ----------

test('un compte actif reçoit un lien de réinitialisation', function () {
    $user = resetUser();

    $response = $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertOk()
        ->assertJsonPath('status', 'sent')
        ->assertJsonPath('message', RESET_SENT);

    expect(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeTrue()
        ->and(resetMails())->toHaveCount(1)
        ->and(resetMails()[0]->getTo()[0]->getAddress())->toBe($user->email);

    // Aucun mot de passe (ni hash) n'est exposé, ni dans la réponse ni dans l'e-mail.
    $body = resetMails()[0]->getHtmlBody();
    expect($response->getContent())->not->toContain($user->password)->not->toContain('ancien-mot-de-passe')
        ->and($body)->not->toContain($user->password)->not->toContain('ancien-mot-de-passe');

    // Le jeton n'est jamais stocké en clair.
    expect(DB::table('password_reset_tokens')->where('email', $user->email)->value('token'))
        ->not->toBe(resetTokenFromLastMail());
});

test('l\'adresse est reconnue sans tenir compte de la casse', function () {
    $user = resetUser(['email' => 'Etudiant.Test@example.test']);

    $this->postJson('/api/forgot-password', ['email' => '  etudiant.test@EXAMPLE.test '])
        ->assertOk()->assertJsonPath('status', 'sent');
    expect(resetMails())->toHaveCount(1);
});

// ---------- TEST 2 : adresse inexistante ----------

test('une adresse sans compte ne déclenche ni lien ni e-mail', function () {
    $this->postJson('/api/forgot-password', ['email' => 'personne@example.test'])
        ->assertNotFound()
        ->assertJsonPath('status', 'not_found')
        ->assertJsonPath('message', RESET_NOT_FOUND);

    expectNoResetSent('personne@example.test');
});

// ---------- TEST 3 : compte désactivé ----------

test('un compte désactivé ne reçoit aucun lien', function () {
    $user = resetUser(['is_active' => false]);

    $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertForbidden()
        ->assertJsonPath('status', 'disabled')
        ->assertJsonPath('message', RESET_DISABLED);

    expectNoResetSent($user->email);
});

// ---------- TEST 4 : compte supprimé (Corbeille) ----------

test('un compte présent dans la corbeille est traité comme inexistant', function () {
    $user = resetUser();
    $user->delete(); // suppression logique = Corbeille

    expect(User::onlyTrashed()->where('email', $user->email)->exists())->toBeTrue();

    $this->postJson('/api/forgot-password', ['email' => $user->email])
        ->assertNotFound()
        ->assertJsonPath('status', 'not_found')
        ->assertJsonPath('message', RESET_NOT_FOUND);

    expectNoResetSent($user->email);
});

test('la réponse pour un compte supprimé est identique à celle d\'une adresse inconnue', function () {
    $deleted = resetUser();
    $deleted->delete();

    $forDeleted = $this->postJson('/api/forgot-password', ['email' => $deleted->email]);
    $forUnknown = $this->postJson('/api/forgot-password', ['email' => 'inconnu@example.test']);

    expect($forDeleted->status())->toBe($forUnknown->status())
        ->and($forDeleted->json())->toBe($forUnknown->json());
});

// ---------- TEST 5 : suppression définitive ----------

test('un compte supprimé définitivement est traité comme inexistant', function () {
    $user = resetUser();
    $email = $user->email;
    $user->forceDelete();

    $this->postJson('/api/forgot-password', ['email' => $email])
        ->assertNotFound()
        ->assertJsonPath('message', RESET_NOT_FOUND);

    expectNoResetSent($email);
});

// ---------- TEST 6 : lien valide ----------

test('un lien valide permet de définir un nouveau mot de passe et invalide l\'ancien', function () {
    $user = resetUser();

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();
    $token = resetTokenFromLastMail();

    // La page de réinitialisation est servie par l'application React.
    $this->get('/reinitialiser-mot-de-passe?token=' . urlencode($token) . '&email=' . urlencode($user->email))->assertOk();

    // Règles actuelles : 8 caractères minimum + confirmation.
    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'court', 'password_confirmation' => 'court'])
        ->assertStatus(422);
    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'nouveau-mot-de-passe', 'password_confirmation' => 'autre'])
        ->assertStatus(422);

    $this->postJson('/api/reset-password', [
        'email' => $user->email,
        'token' => $token,
        'password' => 'nouveau-mot-de-passe',
        'password_confirmation' => 'nouveau-mot-de-passe',
    ])->assertOk();

    $fresh = $user->fresh();
    expect(Hash::check('nouveau-mot-de-passe', $fresh->password))->toBeTrue()
        ->and(Hash::check('ancien-mot-de-passe', $fresh->password))->toBeFalse()
        ->and($fresh->password)->not->toBe('nouveau-mot-de-passe')
        ->and(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeFalse();

    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'nouveau-mot-de-passe'])->assertOk();
    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'ancien-mot-de-passe'])->assertStatus(422);

    // Le lien est à usage unique.
    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'encore-un-autre-mdp', 'password_confirmation' => 'encore-un-autre-mdp'])
        ->assertStatus(422);
});

// ---------- TEST 7 : lien expiré ----------

test('un lien expiré est refusé sans changer le mot de passe', function () {
    $user = resetUser();

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();
    $token = resetTokenFromLastMail();

    $this->travel(61)->minutes();

    $this->postJson('/api/reset-password', [
        'email' => $user->email,
        'token' => $token,
        'password' => 'nouveau-mot-de-passe',
        'password_confirmation' => 'nouveau-mot-de-passe',
    ])->assertStatus(422)->assertJsonPath('errors.token.0', 'Lien invalide ou expiré.');

    expect(Hash::check('ancien-mot-de-passe', $user->fresh()->password))->toBeTrue();
});

test('un lien encore valide à 59 minutes fonctionne', function () {
    $user = resetUser();

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();
    $token = resetTokenFromLastMail();

    $this->travel(59)->minutes();

    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'nouveau-mot-de-passe', 'password_confirmation' => 'nouveau-mot-de-passe'])
        ->assertOk();
});

// ---------- Sécurité complémentaire ----------

test('désactiver un compte révoque ses liens de réinitialisation en cours', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $user = resetUser();

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();
    $token = resetTokenFromLastMail();

    Sanctum::actingAs($admin);
    $this->postJson("/api/users/{$user->id}/deactivate", ['reason' => 'Test'])->assertOk();

    expect(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeFalse();

    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'nouveau-mot-de-passe', 'password_confirmation' => 'nouveau-mot-de-passe'])
        ->assertStatus(422);
    expect($user->fresh()->is_active)->toBeFalse();
});

test('un ancien lien ne réactive pas un compte désactivé qui avait déjà un mot de passe', function () {
    $user = resetUser(['is_active' => false]);
    DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => Hash::make('jeton-existant'), 'created_at' => now()]);

    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => 'jeton-existant', 'password' => 'nouveau-mot-de-passe', 'password_confirmation' => 'nouveau-mot-de-passe'])
        ->assertStatus(422)->assertJsonPath('errors.token.0', RESET_DISABLED);

    expect($user->fresh()->is_active)->toBeFalse()
        ->and(Hash::check('ancien-mot-de-passe', $user->fresh()->password))->toBeTrue();
});

test('un lien de compte supprimé ne fonctionne plus', function () {
    $user = resetUser();
    DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => Hash::make('jeton-existant'), 'created_at' => now()]);
    $user->delete();

    $this->postJson('/api/reset-password', ['email' => $user->email, 'token' => 'jeton-existant', 'password' => 'nouveau-mot-de-passe', 'password_confirmation' => 'nouveau-mot-de-passe'])
        ->assertStatus(422);
});

test('la demande de lien est limitée pour freiner l\'énumération d\'adresses', function () {
    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/api/forgot-password', ['email' => "inconnu{$i}@example.test"])->assertNotFound();
    }

    $this->postJson('/api/forgot-password', ['email' => 'inconnu11@example.test'])->assertStatus(429);
});
