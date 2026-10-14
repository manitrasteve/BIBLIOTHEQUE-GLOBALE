<?php

// Digest hebdomadaire : les membres actifs reçoivent nouveautés + reprise de lecture ;
// le staff et les comptes inactifs sont exclus, et rien n'est envoyé s'il n'y a rien à dire.

use App\Models\Document;
use App\Models\Library;
use App\Models\ReadingProgress;
use App\Models\User;
use App\Services\WeeklyDigest;
use Symfony\Component\Mime\Email;

// E-mails réellement rendus (transport « array » en test).
function digestMails(): array
{
    return array_map(
        fn ($sent) => $sent->getOriginalMessage(),
        iterator_to_array(app('mailer')->getSymfonyTransport()->messages()),
    );
}

function digestMailTo(string $email): ?Email
{
    $mails = array_values(array_filter(digestMails(), fn (Email $m) => $m->getTo()[0]->getAddress() === $email));

    return end($mails) ?: null;
}

test('un membre actif reçoit les nouveautés et la reprise de lecture', function () {
    $lib = Library::factory()->create();
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'etu@test.fr', 'name' => 'Koto Rakoto', 'library_id' => $lib->id]);

    Document::factory()->create(['status' => 'publie', 'published_at' => now(), 'title' => 'Nouveau livre de la semaine']);
    $enCours = Document::factory()->create(['status' => 'publie', 'title' => 'Livre en cours de lecture']);
    ReadingProgress::create(['user_id' => $member->id, 'document_id' => $enCours->id, 'last_page' => 20, 'total_pages' => 100]);

    $sent = app(WeeklyDigest::class)->sendAll();

    expect($sent)->toBe(1);
    $mail = digestMailTo('etu@test.fr');
    expect($mail)->not->toBeNull();
    expect($mail->getHtmlBody())
        ->toContain('Koto Rakoto')
        ->toContain('Nouveau livre de la semaine')
        ->toContain('Livre en cours de lecture')
        ->toContain('Page 20 sur 100');
});

test('aucun envoi si le membre n\'a ni nouveauté ni lecture en cours', function () {
    User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'vide@test.fr']);
    // Aucun document publié cette semaine, aucune lecture.

    $sent = app(WeeklyDigest::class)->sendAll();

    expect($sent)->toBe(0);
    expect(digestMails())->toBeEmpty();
});

test('le staff et les comptes inactifs ne reçoivent pas le digest', function () {
    Document::factory()->create(['status' => 'publie', 'published_at' => now(), 'title' => 'Nouveauté']);

    User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'membre@test.fr']);
    User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'email' => 'admin@test.fr']);
    User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'email' => 'biblio@test.fr']);
    User::factory()->create(['role' => 'etudiant', 'is_active' => false, 'email' => 'inactif@test.fr']);

    $sent = app(WeeklyDigest::class)->sendAll();

    expect($sent)->toBe(1);
    expect(digestMailTo('membre@test.fr'))->not->toBeNull();
    expect(digestMailTo('admin@test.fr'))->toBeNull();
    expect(digestMailTo('biblio@test.fr'))->toBeNull();
    expect(digestMailTo('inactif@test.fr'))->toBeNull();
});

test('la commande digest:hebdomadaire s\'exécute sans erreur', function () {
    Document::factory()->create(['status' => 'publie', 'published_at' => now()]);
    User::factory()->create(['role' => 'chercheur', 'is_active' => true, 'email' => 'cherch@test.fr']);

    $this->artisan('digest:hebdomadaire')->assertExitCode(0);
    expect(digestMailTo('cherch@test.fr'))->not->toBeNull();
});
