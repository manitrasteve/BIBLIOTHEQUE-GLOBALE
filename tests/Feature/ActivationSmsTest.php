<?php

// SMS « compte activé, consultez votre e-mail » envoyé après l'e-mail du lien de création du mot de passe.

use App\Models\User;
use App\Services\SmsService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['mail.default' => 'array']);
    config(['services.sms' => ['driver' => 'mapi', 'mapi' => ['url' => 'https://mapi.example.test/api', 'username' => 'biblio', 'password' => 'secret']]]);
    Cache::forget('mapi_sms_token');
});

// Mapi qui accepte tout (le premier Http::fake d'un test l'emporte : chaque test choisit le sien).
function fakeMapiOk(): void
{
    Http::fake([
        'mapi.example.test/api/authentication/login' => Http::response(['status' => true, 'token' => 'jeton-1']),
        'mapi.example.test/api/msg/send' => Http::response(['status' => true, 'dryRun' => false, 'result' => 'Sent']),
    ]);
}

function multipartField($request, string $name): ?string
{
    foreach ($request->data() as $part) {
        if ($part['name'] === $name) {
            return (string) $part['contents'];
        }
    }

    return null;
}

function createMember(string $phone): void
{
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    test()->postJson('/api/users/creer', [
        'last_name' => 'Rakoto', 'first_name' => 'Jean', 'email' => 'jean@example.test', 'phone' => $phone,
        'address' => 'Mahajanga', 'gender' => 'masculin', 'date_of_birth' => '1990-05-10', 'role' => 'chercheur',
        'faculty' => 'IOSTM', 'researcher_field' => 'Océanographie', 'specialty' => 'Courants marins',
    ])->assertCreated()->assertJsonPath('mail_sent', true);
}

it('normalise les numéros malgaches', function (string $input, ?string $expected) {
    expect(SmsService::normalizeMadagascar($input))->toBe($expected);
})->with([
    ['034 12 345 67', '+261341234567'],
    ['+261 32 12 345 67', '+261321234567'],
    ['00261381234567', '+261381234567'],
    ['341234567', '+261341234567'],
    ['020 22 123 45', null],
    ['12345', null],
]);

it('envoie un SMS invitant à consulter l\'e-mail quand le compte est créé', function () {
    fakeMapiOk();
    createMember('034 12 345 67');

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/msg/send')
        && $request->header('Authorization') === ['jeton-1']
        && multipartField($request, 'Recipient') === '0341234567'
        && multipartField($request, 'Channel') === 'sms'
        && str_contains(multipartField($request, 'Message'), 'activé')
        && str_contains(multipartField($request, 'Message'), 'jean@example.test'));
});

it('aucun SMS sans numéro mobile valide', function () {
    fakeMapiOk();
    createMember('020 22 123 45');

    Http::assertNothingSent();
});

it('un échec du fournisseur SMS ne bloque pas la création du compte', function () {
    Http::fake(['mapi.example.test/*' => Http::response(['status' => false, 'result' => 'Plus d\'unités'], 409)]);

    createMember('0341234567');

    Http::assertSentCount(1); // connexion refusée : rien d'autre n'est tenté
    expect(User::where('email', 'jean@example.test')->exists())->toBeTrue();
});

it('jeton Mapi expiré : reconnexion puis nouvel essai', function () {
    Cache::put('mapi_sms_token', 'jeton-expire', 60);
    Http::fake([
        'mapi.example.test/api/authentication/login' => Http::response(['status' => true, 'token' => 'jeton-neuf']),
        'mapi.example.test/api/msg/send' => fn ($request) => $request->header('Authorization') === ['jeton-neuf']
            ? Http::response(['status' => true, 'result' => 'Sent'])
            : Http::response(['status' => false, 'message' => 'Authentication credentials required'], 401),
    ]);

    app(SmsService::class)->send('0341234567', 'Test');

    Http::assertSentCount(3); // envoi refusé, connexion, envoi réussi
});

it('envoie aussi le SMS à un bibliothécaire créé par l\'administrateur', function () {
    fakeMapiOk();
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->postJson('/api/librarians', [
        'last_name' => 'Rasoa', 'first_name' => 'Lala', 'email' => 'biblio.sms@example.test', 'phone' => '037 40 775 89',
        'address' => 'Mahajanga', 'gender' => 'feminin', 'cin_number' => '123456789012', 'cin_issued_at' => '2015-01-10',
    ])->assertCreated()->assertJsonPath('mail_sent', true);

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/msg/send')
        && multipartField($request, 'Recipient') === '0374077589'
        && str_contains(multipartField($request, 'Message'), 'a été créé')
        && str_contains(multipartField($request, 'Message'), 'biblio.sms@example.test'));
});

it('les tests n\'envoient jamais de vrais SMS, même si .env active Mapi', function () {
    // phpunit.xml force le pilote « log » : sans lui, chaque test qui crée un compte consommait des crédits Mapi.
    expect(env('SMS_DRIVER'))->toBe('log')
        ->and(env('MAPI_PASSWORD'))->toBeEmpty();
});
