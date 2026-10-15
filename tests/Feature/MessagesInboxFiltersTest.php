<?php

// Boîte de réception « Messages » : copie à l'administrateur des messages d'un bibliothécaire,
// recherche et filtres (expéditeur, date, heure, jour de la semaine — à l'heure de Madagascar, UTC+3).

use App\Models\AdminMessage;
use App\Models\AdminMessageRecipient;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Mail::fake();
    config(['app.display_timezone' => 'Indian/Antananarivo']);
});

/** Message reçu par $reader, envoyé par $sender à l'instant UTC donné. */
function inboxMessage(User $reader, User $sender, string $subject, string $utc, string $body = 'Contenu'): AdminMessageRecipient
{
    test()->travelTo($utc);
    $message = AdminMessage::create(['sender_id' => $sender->id, 'subject' => $subject, 'message' => $body, 'recipient_count' => 1]);
    $recipient = AdminMessageRecipient::create(['admin_message_id' => $message->id, 'user_id' => $reader->id, 'email' => $reader->email, 'status' => 'envoye']);
    test()->travelBack();

    return $recipient;
}

function inboxSubjects(string $query = ''): array
{
    return collect(test()->getJson('/api/messages' . ($query ? "?{$query}" : ''))->assertOk()->json('data'))
        ->pluck('message.subject')->sort()->values()->all();
}

test('un message envoyé par un bibliothécaire arrive aussi dans la boîte de l\'administrateur', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);

    Sanctum::actingAs($librarian);
    $this->postJson('/api/admin-messages', ['subject' => 'Fermeture', 'message' => 'Fermé lundi', 'recipient_ids' => [$student->id]])->assertCreated();

    expect(AdminMessageRecipient::pluck('user_id')->sort()->values()->all())->toBe(collect([$admin->id, $student->id])->sort()->values()->all())
        ->and(AppNotification::where('user_id', $admin->id)->where('type', 'message_admin')->exists())->toBeTrue();

    $this->app['auth']->forgetGuards();
    Sanctum::actingAs($admin);
    $this->getJson('/api/messages')->assertOk()
        ->assertJsonPath('data.0.message.subject', 'Fermeture')
        ->assertJsonPath('data.0.message.sender.role', 'bibliothecaire');
});

test('un bibliothécaire sans destinataire sélectionné reste refusé, même si l\'administrateur recevrait une copie', function () {
    User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]));

    $this->postJson('/api/admin-messages', ['subject' => 'Info', 'message' => 'm', 'recipient_ids' => []])->assertStatus(422);
    expect(AdminMessage::count())->toBe(0);
});

test('un message de l\'administrateur ne lui revient pas en copie', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    Sanctum::actingAs($admin);

    $this->postJson('/api/admin-messages', ['subject' => 'Info', 'message' => 'm', 'send_to_all' => true])->assertCreated();
    expect(AdminMessageRecipient::where('user_id', $admin->id)->exists())->toBeFalse();
});

test('recherche par objet, contenu ou nom de l\'expéditeur, sans voir les messages des autres', function () {
    $reader = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $admin = User::factory()->create(['role' => 'administrateur', 'name' => 'Rabe Admin']);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'name' => 'Soa Biblio']);

    inboxMessage($reader, $admin, 'Horaires d\'été', '2026-10-01 08:00:00');
    inboxMessage($reader, $librarian, 'Nouveaux livres', '2026-10-02 08:00:00', 'Arrivage de romans');
    inboxMessage(User::factory()->create(), $admin, 'Horaires privés', '2026-10-03 08:00:00');
    Sanctum::actingAs($reader);

    expect(inboxSubjects('search=horaires'))->toBe(["Horaires d'été"])
        ->and(inboxSubjects('search=romans'))->toBe(['Nouveaux livres'])
        ->and(inboxSubjects('search=Soa'))->toBe(['Nouveaux livres'])
        ->and(inboxSubjects('search=100%'))->toBe([]);
});

test('filtre par expéditeur : administrateur ou bibliothécaire', function () {
    $reader = User::factory()->create(['role' => 'enseignant', 'is_active' => true]);
    inboxMessage($reader, User::factory()->create(['role' => 'administrateur']), 'De l\'admin', '2026-10-01 08:00:00');
    inboxMessage($reader, User::factory()->create(['role' => 'bibliothecaire']), 'De la bibliothèque', '2026-10-01 09:00:00');
    Sanctum::actingAs($reader);

    expect(inboxSubjects('sender_role=administrateur'))->toBe(["De l'admin"])
        ->and(inboxSubjects('sender_role=bibliothecaire'))->toBe(['De la bibliothèque'])
        ->and(inboxSubjects())->toHaveCount(2);
});

test('filtres date, heure et jour de la semaine à l\'heure locale de Madagascar', function () {
    $reader = User::factory()->create(['role' => 'chercheur', 'is_active' => true]);
    $admin = User::factory()->create(['role' => 'administrateur']);

    // Mercredi 14/10/2026 22:30 UTC = jeudi 15/10 01:30 à Madagascar.
    inboxMessage($reader, $admin, 'Nuit', '2026-10-14 22:30:00');
    // Jeudi 15/10/2026 07:00 UTC = jeudi 15/10 10:00 local.
    inboxMessage($reader, $admin, 'Matin', '2026-10-15 07:00:00');
    // Lundi 12/10/2026 13:00 UTC = lundi 12/10 16:00 local.
    inboxMessage($reader, $admin, 'Après-midi', '2026-10-12 13:00:00');
    Sanctum::actingAs($reader);

    expect(inboxSubjects('date=2026-10-15'))->toBe(['Matin', 'Nuit'])
        ->and(inboxSubjects('date=2026-10-14'))->toBe([])
        ->and(inboxSubjects('weekday=4'))->toBe(['Matin', 'Nuit'])   // jeudi
        ->and(inboxSubjects('weekday=1'))->toBe(['Après-midi'])      // lundi
        ->and(inboxSubjects('time_from=09:00&time_to=12:00'))->toBe(['Matin'])
        ->and(inboxSubjects('time_from=15:00'))->toBe(['Après-midi'])
        ->and(inboxSubjects('time_from=22:00&time_to=06:00'))->toBe(['Nuit']) // plage de nuit
        ->and(inboxSubjects('weekday=4&time_from=09:00'))->toBe(['Matin'])
        ->and(inboxSubjects('date=2026-10-15&sender_role=bibliothecaire'))->toBe([]);

    // Le total paginé reflète les filtres.
    $this->getJson('/api/messages?weekday=4')->assertJsonPath('total', 2);
});

test('des filtres invalides sont refusés proprement (422), jamais en erreur serveur', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->getJson('/api/messages?sender_role=etudiant')->assertStatus(422);
    $this->getJson('/api/messages?date=15/10/2026')->assertStatus(422);
    $this->getJson('/api/messages?time_from=25:00')->assertStatus(422);
    $this->getJson('/api/messages?weekday=9')->assertStatus(422);
    $this->getJson('/api/messages?search[]=x')->assertStatus(422);
});
