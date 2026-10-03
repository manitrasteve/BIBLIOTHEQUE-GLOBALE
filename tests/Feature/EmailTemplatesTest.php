<?php

use App\Models\AccountRequest;
use App\Models\Library;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

function sentEmails(): array
{
    $transport = Mail::mailer('array')->getSymfonyTransport();

    return collect($transport->messages())
        ->map(fn ($sent) => $sent->getOriginalMessage())
        ->all();
}

function lastEmail()
{
    $all = sentEmails();

    return end($all);
}

function buttonUrl(string $html): string
{
    preg_match('/<a href="([^"]+)" target="_blank"[^>]*>([^<]+)<\/a>/', $html, $m);

    return html_entity_decode($m[1] ?? '');
}

function expectCleanEmail(string $html): void
{
    expect($html)->not->toContain('rgba(')
        ->not->toContain('box-shadow')
        ->not->toContain('linear-gradient')
        ->not->toContain('Matricule')
        ->not->toContain('matricule');
}

test('la vérification d’une demande envoie un e-mail HTML avec bouton vers la demande', function () {
    $library = Library::factory()->create();
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id]);
    $req = AccountRequest::factory()->create(['library_id' => $library->id]);

    $this->actingAs($librarian, 'sanctum')->postJson("/api/account-requests/{$req->id}/verify")->assertOk();

    $email = lastEmail();
    $html = $email->getHtmlBody();

    expect($email->getSubject())->toBe('Votre demande de compte a été vérifiée');
    expect($html)->toContain('Votre demande a été vérifiée')->toContain($req->request_number);
    expect(buttonUrl($html))->toBe(rtrim(config('app.url'), '/') . '/ticket/' . $req->uuid);
    expect($html)->toContain('cid:'); // logo joint à l'e-mail
    expectCleanEmail($html);
});

test('le rejet d’une demande affiche le motif tel que saisi', function () {
    $library = Library::factory()->create();
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id]);
    $req = AccountRequest::factory()->create(['library_id' => $library->id]);

    $this->actingAs($librarian, 'sanctum')
        ->postJson("/api/account-requests/{$req->id}/reject", ['reason' => 'Pièce justificative illisible'])
        ->assertOk();

    $html = lastEmail()->getHtmlBody();

    expect($html)->toContain('Votre demande a été rejetée')->toContain('Pièce justificative illisible');
    expectCleanEmail($html);
});

test('la validation envoie le numéro de compte réel et un bouton vers le lien sécurisé valide', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $req = AccountRequest::factory()->create([
        'library_id' => $library->id,
        'status' => 'verifiee',
        'role' => 'enseignant',
        'validation_deadline_at' => now()->addHours(24),
    ]);

    $this->actingAs($admin, 'sanctum')->postJson("/api/account-requests/{$req->id}/validate")->assertSuccessful();

    $user = User::where('email', $req->email)->firstOrFail();
    $html = lastEmail()->getHtmlBody();

    expect($user->matricule)->toStartWith('ENS-');
    expect($html)
        ->toContain('Votre compte a été validé')
        ->toContain('Vous pouvez maintenant créer votre mot de passe')
        ->toContain('Numéro de compte')
        ->toContain($user->matricule)
        ->toContain('72 heures');
    expectCleanEmail($html);

    $url = buttonUrl($html);
    expect($url)->toStartWith(rtrim(config('app.url'), '/') . '/creer-mot-de-passe?token=');

    parse_str(parse_url($url, PHP_URL_QUERY), $query);
    $token = $query['token'];

    // Token valide
    $this->getJson("/api/account-requests/setup/{$token}")->assertOk();

    // Token incorrect
    $this->getJson('/api/account-requests/setup/' . str_repeat('x', 64))->assertNotFound();

    // Token expiré
    $req->refresh()->update(['setup_expires_at' => now()->subMinute()]);
    $this->getJson("/api/account-requests/setup/{$token}")->assertStatus(410);
});

test('les variantes nouveau lien et compte créé affichent le bon titre et le lien exact', function () {
    $library = Library::factory()->create();
    $user = User::factory()->create(['role' => 'etudiant', 'matricule' => 'ETU-2026-0007', 'library_id' => $library->id]);
    $req = AccountRequest::factory()->create(['library_id' => $library->id, 'created_user_id' => $user->id]);

    foreach (['new_link' => 'Un nouveau lien vous a été envoyé', 'created' => 'Votre compte a été créé'] as $variant => $title) {
        Mail::send('emails.account-setup', [
            'user' => $user,
            'request' => $req,
            'token' => 'tok123',
            'variant' => $variant,
        ], fn ($m) => $m->to($user->email)->subject('Test'));

        $html = lastEmail()->getHtmlBody();

        expect($html)->toContain($title)->toContain('ETU-2026-0007')->toContain('Créer mon mot de passe');
        expect(buttonUrl($html))->toBe(rtrim(config('app.url'), '/') . '/creer-mot-de-passe?token=tok123');
        expectCleanEmail($html);
    }
});

test('la réinitialisation du mot de passe envoie un bouton vers le lien sécurisé', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);

    $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

    $html = lastEmail()->getHtmlBody();
    $url = buttonUrl($html);

    expect($html)->toContain('Réinitialiser mon mot de passe')->toContain('60 minutes');
    expect($url)->toStartWith(rtrim(config('app.url'), '/') . '/reinitialiser-mot-de-passe?token=');
    expect($url)->toContain('email=' . urlencode($user->email));
    expect($html)->not->toContain('password');
    expectCleanEmail($html);
});

test('l’e-mail de création d’un bibliothécaire contient son numéro de compte réel', function () {
    $library = Library::factory()->create();
    $admin = User::factory()->create(['role' => 'administrateur']);

    $this->actingAs($admin, 'sanctum')->postJson('/api/librarians', [
        'library_id' => $library->id,
        'last_name' => 'Rakoto',
        'first_name' => 'Soa',
        'gender' => 'feminin',
        'cin_number' => '123456789012',
        'cin_issued_at' => '2025-01-15',
        'address' => 'Mahajanga',
        'phone' => '+261340000000',
        'email' => 'soa.email@example.com',
    ])->assertCreated();

    $user = User::where('email', 'soa.email@example.com')->firstOrFail();
    $html = lastEmail()->getHtmlBody();

    expect($html)->toContain('Numéro de compte')->toContain($user->matricule)->toContain('Créer mon mot de passe');
    expect(buttonUrl($html))->toContain('/reinitialiser-mot-de-passe?token=');
    expectCleanEmail($html);
});
