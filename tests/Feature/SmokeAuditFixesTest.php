<?php

// Corrections issues du test de fumée (RouteSmokeTest) et de la relecture des fonctionnalités.

use App\Models\Consultation;
use App\Models\CourseList;
use App\Models\Document;
use App\Models\Library;
use App\Models\TeacherClass;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

beforeEach(fn () => Http::fake());

test('connexion avec un e-mail non textuel : erreur de validation, pas d\'erreur serveur', function () {
    $this->postJson('/api/login', ['email' => ['a@b.mg'], 'password' => 'x'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});

test('listes du personnel : un filtre en tableau est ignoré au lieu de provoquer une erreur 500', function () {
    $library = Library::factory()->create();
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'library_id' => $library->id]));

    $this->getJson('/api/account-requests?status[]=en_attente&search[]=x')->assertOk();
    $this->getJson('/api/account-requests/export?status[]=en_attente&search[]=x')->assertOk();
    $this->getJson('/api/documents-manage?status[]=publie&q[]=x&library_id[]=1')->assertOk();
});

test('recherche d\'auteurs (publique) et d\'utilisateurs : un paramètre en tableau ne provoque pas d\'erreur 500', function () {
    $this->getJson('/api/authors?search[]=x')->assertOk();

    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));
    $this->getJson('/api/users?search[]=x&role[]=etudiant')->assertOk();
    $this->getJson('/api/users/export?search[]=x')->assertOk();
});

test('réactiver un compte déjà actif ne réinitialise ni son mot de passe ni ses sessions', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'password_set_at' => now()]);
    $user->createToken('api');
    $hash = $user->password;
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->postJson("/api/users/{$user->id}/reactivate")->assertOk();

    $user->refresh();
    expect($user->password)->toBe($hash)
        ->and($user->password_set_at)->not->toBeNull()
        ->and($user->tokens()->count())->toBe(1);
});

test('notification d\'un message reçu : un étudiant est dirigé vers sa boîte de réception, sur ce message', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    \Illuminate\Support\Facades\Mail::fake();

    Sanctum::actingAs($admin);
    $this->postJson('/api/admin-messages', ['subject' => 'Info', 'message' => 'Bonjour', 'send_to_all' => true])->assertCreated();

    $recipientId = \App\Models\AdminMessageRecipient::where('user_id', $student->id)->value('id');
    $this->app['auth']->forgetGuards();
    Sanctum::actingAs($student);

    $this->getJson('/api/notifications')->assertOk()
        ->assertJsonPath('data.0.type', 'message_admin')
        ->assertJsonPath('data.0.related_url', "/messages?message={$recipientId}");
});

test('message groupé : tous les destinataires le reçoivent dans l\'application avant les envois d\'e-mails', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $students = User::factory()->count(3)->create(['role' => 'etudiant', 'is_active' => true]);

    // Au premier envoi SMTP, les 3 notifications et messages internes doivent déjà exister ; le 2e envoi échoue.
    $seenAtFirstMail = null;
    $calls = 0;
    \Illuminate\Support\Facades\Mail::shouldReceive('send')->times(3)->andReturnUsing(function () use (&$seenAtFirstMail, &$calls) {
        $calls++;
        $seenAtFirstMail ??= [\App\Models\AppNotification::where('type', 'message_admin')->count(), \App\Models\AdminMessageRecipient::count()];
        if ($calls === 2) {
            throw new RuntimeException('SMTP injoignable');
        }
    });

    Sanctum::actingAs($admin);
    $this->postJson('/api/admin-messages', ['subject' => 'Info', 'message' => 'Bonjour', 'send_to_all' => true])->assertCreated();

    expect($seenAtFirstMail)->toBe([3, 3])
        ->and(\App\Models\AdminMessageRecipient::pluck('status')->sort()->values()->all())->toBe(['echec', 'envoye', 'envoye'])
        ->and(\App\Models\AdminMessage::first()->only(['success_count', 'failure_count']))->toBe(['success_count' => 2, 'failure_count' => 1]);
});

test('mes lectures : les documents retirés du catalogue sont exclus avant la pagination', function () {
    $library = Library::factory()->create();
    $reader = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $library->id]);

    // 20 lectures récentes de documents archivés (une page entière), puis une lecture plus ancienne d'un document publié.
    $published = Document::factory()->create(['status' => 'publie', 'published_at' => now(), 'library_id' => $library->id]);
    Consultation::create(['user_id' => $reader->id, 'document_id' => $published->id, 'consulted_at' => now()->subDays(30)]);
    Document::factory()->count(20)->create(['status' => 'archive', 'library_id' => $library->id])
        ->each(fn ($d) => Consultation::create(['user_id' => $reader->id, 'document_id' => $d->id, 'consulted_at' => now()]));

    Sanctum::actingAs($reader);

    $this->getJson('/api/mes-lectures')->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('last_page', 1)
        ->assertJsonPath('data.0.document_id', $published->id);
});

test('rappel de lecture : le nombre de non-lecteurs n\'est pas révélé pour une petite classe', function () {
    $library = Library::factory()->create();
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'library_id' => $library->id, 'school' => 'Lycée A']);
    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'Lycée A', 'level' => 'Terminale']);
    User::factory()->count(2)->create(['role' => 'etudiant', 'is_active' => true, 'school' => 'Lycée A', 'niveau_detail' => 'Terminale']);

    $document = Document::factory()->create(['status' => 'publie', 'published_at' => now(), 'library_id' => $library->id]);
    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'Liste', 'school' => 'Lycée A', 'level' => 'Terminale']);
    $item = $list->items()->create(['document_id' => $document->id, 'position' => 1]);

    Sanctum::actingAs($teacher);

    $this->postJson("/api/course-lists/{$list->id}/items/{$item->id}/remind")->assertOk()->assertJsonPath('sent', null);
});
