<?php

// Cohérence entre l'e-mail reçu, le lien et la page atteinte :
//  - création d'un compte (bibliothécaire, réactivation) : « créer » partout, lien avec type=creation ;
//  - création directe par l'administrateur / validation d'une demande : lien /creer-mot-de-passe ;
//  - « mot de passe oublié » : reste une vraie réinitialisation, sans type=creation.

use App\Models\Library;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

function pwdLastMail()
{
    $all = collect(Mail::mailer('array')->getSymfonyTransport()->messages())->map(fn ($s) => $s->getOriginalMessage())->all();

    return end($all);
}

function pwdButtonUrl(string $html): string
{
    preg_match('/<a href="([^"]+)" target="_blank"[^>]*>([^<]+)<\/a>/', $html, $m);

    return html_entity_decode($m[1] ?? '');
}

function pwdQuery(string $url): array
{
    parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $q);

    return $q;
}

test('la création d\'un bibliothécaire envoie un message « créer » et un lien de création (type=creation) valable', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $this->actingAs($admin, 'sanctum')->postJson('/api/librarians', [
        'library_id' => $library->id, 'last_name' => 'Rakoto', 'first_name' => 'Soa', 'gender' => 'feminin', 'cin_number' => '123456789012',
        'cin_issued_at' => '2025-01-15', 'address' => 'Mahajanga', 'phone' => '+261340000000', 'email' => 'soa.creation@example.com',
    ])->assertCreated();

    $html = pwdLastMail()->getHtmlBody();
    $url = pwdButtonUrl($html);
    $query = pwdQuery($url);

    // Message : uniquement du vocabulaire de création.
    expect($html)->toContain('Votre compte Bibliothécaire a été créé')->toContain('créer votre mot de passe')->toContain('Créer mon mot de passe')
        ->not->toContain('Réinitialis')->not->toContain('réinitialis');
    // Lien : page de mot de passe, avec le marqueur de création et l'adresse du compte.
    expect($url)->toStartWith(rtrim(config('app.url'), '/') . '/reinitialiser-mot-de-passe?token=')
        ->and($query)->toHaveKeys(['token', 'email', 'type'])
        ->and($query['type'])->toBe('creation')->and($query['email'])->toBe('soa.creation@example.com');

    // Le lien fonctionne vraiment : il définit le mot de passe et active le compte.
    $this->postJson('/api/reset-password', ['email' => $query['email'], 'token' => $query['token'], 'password' => 'mot-de-passe-solide', 'password_confirmation' => 'mot-de-passe-solide'])->assertOk();
    $user = User::where('email', 'soa.creation@example.com')->firstOrFail();
    expect($user->is_active)->toBeTrue()->and($user->password_set_at)->not->toBeNull();
});

test('la réactivation d\'un compte envoie un message « créer » et un lien de création (type=creation)', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => false, 'email' => 'reactive@example.com']);

    $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$student->id}/reactivate")->assertOk();

    $html = pwdLastMail()->getHtmlBody();
    $query = pwdQuery(pwdButtonUrl($html));

    expect($html)->toContain('Votre compte a été réactivé')->toContain('Créer mon mot de passe')->not->toContain('Réinitialis')
        ->and($query['type'] ?? null)->toBe('creation')->and($query['email'])->toBe('reactive@example.com');
});

test('une vraie réinitialisation (mot de passe oublié) garde son vocabulaire et son lien, sans type=creation', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

    $html = pwdLastMail()->getHtmlBody();
    $url = pwdButtonUrl($html);

    expect($html)->toContain('Réinitialiser mon mot de passe')
        ->and($url)->toStartWith(rtrim(config('app.url'), '/') . '/reinitialiser-mot-de-passe?token=')
        ->and(pwdQuery($url))->not->toHaveKey('type');
});

test('la création directe d\'un compte par l\'administrateur envoie un message « créer » et le lien /creer-mot-de-passe', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $this->actingAs($admin, 'sanctum')->postJson('/api/users/creer', [
        'library_id' => $library->id, 'role' => 'enseignant', 'last_name' => 'Rabe', 'first_name' => 'Jean', 'email' => 'enseignant.lien@example.test',
        'phone' => '0340000000', 'address' => 'Mahajanga', 'gender' => 'masculin', 'date_of_birth' => '1980-01-01',
        'faculty' => 'IOSTM', 'teaching_specialty' => 'Informatique',
    ])->assertCreated();

    $html = pwdLastMail()->getHtmlBody();
    $url = pwdButtonUrl($html);

    expect($html)->toContain('Votre compte a été créé')->toContain('Vous pouvez maintenant créer votre mot de passe')->toContain('Créer mon mot de passe')
        ->not->toContain('Réinitialis')->not->toContain('réinitialis')
        ->and($url)->toStartWith(rtrim(config('app.url'), '/') . '/creer-mot-de-passe?token=');

    // Le jeton du lien est bien accepté par la page de création (setupForm).
    $token = pwdQuery($url)['token'];
    $this->getJson("/api/account-requests/setup/{$token}")->assertOk()->assertJson(['valid' => true]);
});
