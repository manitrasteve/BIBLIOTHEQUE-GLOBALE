<?php

use App\Models\AccountRequest;
use App\Models\AdminMessage;
use App\Models\AdminMessageRecipient;
use App\Models\AiQuery;
use App\Models\Author;
use App\Models\CourseList;
use App\Models\Document;
use App\Models\ProblemReport;
use App\Models\SiteUpdate;
use App\Models\StaffMessage;
use App\Models\TeacherClass;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

// Routes qui n'étaient appelées par aucun autre test : un passage nominal + les refus essentiels.

beforeEach(function () {
    Queue::fake();
    Mail::fake();
});

function activeUser(string $role, array $attributes = []): User
{
    return User::factory()->create(['role' => $role, 'is_active' => true, ...$attributes]);
}

test('déconnexion : le jeton courant est révoqué', function () {
    $user = activeUser('etudiant');
    $token = $user->createToken('api')->plainTextToken;

    $this->withToken($token)->postJson('/api/logout')->assertOk();

    expect($user->tokens()->count())->toBe(0);
});

test('tableau de bord personnel et historiques personnels', function () {
    $user = activeUser('etudiant');
    $document = Document::factory()->create(['status' => 'publie']);
    AiQuery::create(['user_id' => $user->id, 'document_id' => $document->id, 'question' => 'Q ?', 'answer' => 'R.']);
    AiQuery::create(['user_id' => activeUser('etudiant')->id, 'document_id' => $document->id, 'question' => 'Autre ?', 'answer' => 'R.']);
    Sanctum::actingAs($user);

    $this->getJson('/api/dashboard/me')->assertOk();
    $this->getJson('/api/mes-consultations')->assertOk();
    $this->getJson('/api/mes-questions-ia')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson("/api/documents/{$document->slug}/ai-history")->assertOk()->assertJsonCount(1);
});

test('favori : ajout puis retrait, refusé sur un document non publié', function () {
    $user = activeUser('etudiant');
    $document = Document::factory()->create(['status' => 'publie']);
    $draft = Document::factory()->create(['status' => 'brouillon']);
    Sanctum::actingAs($user);

    $this->postJson("/api/documents/{$document->slug}/favorite")->assertOk()->assertJson(['favorited' => true, 'favorite_count' => 1]);
    $this->postJson("/api/documents/{$document->slug}/favorite")->assertOk()->assertJson(['favorited' => false, 'favorite_count' => 0]);
    $this->postJson("/api/documents/{$draft->slug}/favorite")->assertNotFound();
});

test('photo de profil : suppression du fichier et du chemin', function () {
    Storage::fake('public');
    $user = activeUser('etudiant', ['photo_path' => 'photos/me.jpg']);
    Storage::disk('public')->put('photos/me.jpg', 'x');
    Sanctum::actingAs($user);

    $this->deleteJson('/api/profile/photo')->assertOk()->assertJson(['photo_url' => null]);

    Storage::disk('public')->assertMissing('photos/me.jpg');
});

test('auteurs : modification et suppression réservées au personnel', function () {
    $author = Author::create(['name' => 'Rakoto']);
    Author::create(['name' => 'Rabe']);

    Sanctum::actingAs(activeUser('etudiant'));
    $this->putJson("/api/authors/{$author->id}", ['name' => 'X'])->assertForbidden();

    Sanctum::actingAs(activeUser('bibliothecaire'));
    $this->putJson("/api/authors/{$author->id}", ['name' => 'Rabe'])->assertUnprocessable();
    $this->putJson("/api/authors/{$author->id}", ['name' => 'Rakoto Jean'])->assertOk()->assertJson(['name' => 'Rakoto Jean']);
    $this->deleteJson("/api/authors/{$author->id}")->assertOk();

    expect(Author::find($author->id))->toBeNull();
});

test('boîte de réception : lecture et suppression de ses propres messages uniquement', function () {
    $admin = activeUser('administrateur');
    $reader = activeUser('etudiant');
    $other = activeUser('etudiant');
    $message = AdminMessage::create(['sender_id' => $admin->id, 'subject' => 'S', 'message' => 'M', 'recipient_count' => 2]);
    $mine = AdminMessageRecipient::create(['admin_message_id' => $message->id, 'user_id' => $reader->id, 'email' => $reader->email, 'status' => 'envoye']);
    $theirs = AdminMessageRecipient::create(['admin_message_id' => $message->id, 'user_id' => $other->id, 'email' => $other->email, 'status' => 'envoye']);
    Sanctum::actingAs($reader);

    $this->postJson("/api/messages/{$theirs->id}/read")->assertForbidden();
    $this->deleteJson("/api/messages/{$theirs->id}")->assertForbidden();
    $this->postJson("/api/messages/{$mine->id}/read")->assertOk();
    expect($mine->fresh()->read_at)->not->toBeNull();

    $this->deleteJson("/api/messages/{$mine->id}")->assertOk();
    $this->getJson('/api/messages')->assertOk()->assertJsonCount(0, 'data');
});

test('messages du personnel : destinataires et suppression de son propre envoi', function () {
    $admin = activeUser('administrateur');
    $librarian = activeUser('bibliothecaire');
    activeUser('etudiant');
    $message = AdminMessage::create(['sender_id' => $admin->id, 'subject' => 'S', 'message' => 'M', 'recipient_count' => 1]);

    Sanctum::actingAs($librarian);
    $this->deleteJson("/api/admin-messages/{$message->id}")->assertForbidden();
    $this->getJson('/api/admin-messages/recipients')->assertOk()->assertJsonCount(1);

    Sanctum::actingAs($admin);
    $this->deleteJson("/api/admin-messages/{$message->id}")->assertOk();
    expect($message->fresh()->deleted_by_sender_at)->not->toBeNull();
});

test('signalement : réponse de l’administrateur notifiée à son auteur', function () {
    $reporter = activeUser('etudiant');
    $report = ProblemReport::create(['user_id' => $reporter->id, 'type' => 'autre', 'subject' => 'Bug', 'description' => 'D', 'status' => 'nouveau']);

    Sanctum::actingAs(activeUser('bibliothecaire'));
    $this->postJson("/api/problem-reports/{$report->id}/reply", ['reply' => 'Ok', 'status' => 'traite'])->assertForbidden();

    Sanctum::actingAs(activeUser('administrateur'));
    $this->postJson("/api/problem-reports/{$report->id}/reply", ['reply' => 'Corrigé', 'status' => 'traite'])
        ->assertOk()
        ->assertJson(['status' => 'traite', 'admin_reply' => 'Corrigé']);

    expect($reporter->appNotifications()->where('type', 'reponse_signalement')->exists())->toBeTrue();
});

test('actualités du site : publication par l’administrateur, lecture publique', function () {
    Storage::fake('public');
    $member = activeUser('etudiant');

    Sanctum::actingAs(activeUser('bibliothecaire'));
    $this->postJson('/api/site-updates', ['title' => 'T', 'description' => 'D'])->assertForbidden();

    Sanctum::actingAs(activeUser('administrateur'));
    $created = $this->postJson('/api/site-updates', [
        'title' => 'Nouveau catalogue',
        'description' => 'Détails',
        'image' => UploadedFile::fake()->image('a.png'),
    ])->assertCreated()->json();

    expect($member->appNotifications()->where('type', 'mise_a_jour_site')->exists())->toBeTrue();

    $this->app['auth']->forgetGuards();
    $this->getJson('/api/site-updates')->assertOk()->assertJsonPath('data.0.title', 'Nouveau catalogue');
    $this->getJson("/api/site-updates/{$created['uuid']}")->assertOk()->assertJson(['title' => 'Nouveau catalogue']);
});

test('discussion du personnel : envoi, lecture, suppression et historique', function () {
    $admin = activeUser('administrateur');
    $librarian = activeUser('bibliothecaire');

    Sanctum::actingAs(activeUser('etudiant'));
    $this->getJson('/api/staff-discussions/librarians')->assertForbidden();
    $this->postJson('/api/staff-discussions/messages', ['recipient_id' => $admin->id, 'message' => 'Salut'])->assertForbidden();

    Sanctum::actingAs($admin);
    $this->getJson('/api/staff-discussions/librarians')->assertOk()->assertJsonCount(1, 'librarians');
    $sent = $this->postJson('/api/staff-discussions/messages', ['recipient_id' => $librarian->id, 'message' => 'Bonjour'])
        ->assertCreated()->json('data');

    Sanctum::actingAs($librarian);
    // Un bibliothécaire écrit toujours à l'administrateur canonique, quel que soit le destinataire envoyé.
    $this->postJson('/api/staff-discussions/messages', ['recipient_id' => $librarian->id, 'message' => 'Réponse'])
        ->assertCreated()->assertJsonPath('data.recipient_id', $admin->id);
    $this->getJson("/api/staff-discussions/{$sent['conversation_id']}/messages")->assertOk()->assertJsonCount(2, 'messages');
    expect(StaffMessage::find($sent['id'])->read_at)->not->toBeNull();

    $this->postJson("/api/staff-discussions/messages/{$sent['id']}/read")->assertOk();
    $this->deleteJson("/api/staff-discussions/messages/{$sent['id']}")->assertOk();
    $this->getJson("/api/staff-discussions/{$sent['conversation_id']}/messages")->assertJsonCount(1, 'messages');

    $this->deleteJson('/api/staff-discussions/history')->assertOk();
    $this->getJson("/api/staff-discussions/{$sent['conversation_id']}/messages")->assertJsonCount(0, 'messages');

    // L'historique n'est effacé que côté bibliothécaire : l'administrateur garde les deux messages.
    Sanctum::actingAs($admin);
    $this->getJson("/api/staff-discussions/{$sent['conversation_id']}/messages")->assertJsonCount(2, 'messages');
});

test('bibliographie : aperçu de l’audience, modification et retrait d’une lecture', function () {
    $teacher = activeUser('enseignant');
    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'Lycée A', 'level' => 'Terminale']);
    activeUser('etudiant', ['school' => 'Lycée A', 'niveau_detail' => 'Terminale']);
    activeUser('etudiant', ['school' => 'Lycée B', 'niveau_detail' => 'Terminale']);
    $document = Document::factory()->create(['status' => 'publie']);
    Sanctum::actingAs($teacher);

    $this->postJson('/api/course-lists/audience', ['school' => 'Lycée A', 'level' => 'Terminale'])->assertOk()->assertJson(['count' => 1]);
    $this->postJson('/api/course-lists/audience', ['school' => 'Lycée B', 'level' => 'Terminale'])->assertUnprocessable();

    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'L', 'school' => 'Lycée A', 'level' => 'Terminale']);
    $item = $list->items()->create(['document_id' => $document->id, 'position' => 1]);
    $otherList = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'Autre', 'school' => 'Lycée A', 'level' => 'Terminale']);

    $this->putJson("/api/course-lists/{$otherList->id}/items/{$item->id}", ['instruction' => 'x'])->assertNotFound();
    $this->putJson("/api/course-lists/{$list->id}/items/{$item->id}", ['instruction' => 'Chapitre 2', 'due_date' => '2030-01-15'])
        ->assertOk()
        ->assertJsonPath('items.0.instruction', 'Chapitre 2');
    Sanctum::actingAs(activeUser('enseignant'));
    $this->deleteJson("/api/course-lists/{$list->id}/items/{$item->id}")->assertForbidden();

    Sanctum::actingAs($teacher);
    $this->deleteJson("/api/course-lists/{$list->id}/items/{$item->id}")->assertOk()->assertJsonCount(0, 'items');
});

test('demande de compte : rejet final par l’administrateur', function () {
    $request = AccountRequest::factory()->create(['status' => 'verifiee']);

    Sanctum::actingAs(activeUser('bibliothecaire'));
    $this->postJson("/api/account-requests/{$request->id}/admin-reject", ['reason' => 'Non'])->assertForbidden();

    Sanctum::actingAs(activeUser('administrateur'));
    $this->postJson("/api/account-requests/{$request->id}/admin-reject", [])->assertUnprocessable();
    $this->postJson("/api/account-requests/{$request->id}/admin-reject", ['reason' => 'Pièce manquante'])->assertOk();

    expect($request->fresh())->status->toBe('rejetee')->rejection_reason->toBe('Pièce manquante');
    $this->postJson("/api/account-requests/{$request->id}/admin-reject", ['reason' => 'Encore'])->assertUnprocessable();
});

test('gestion des permissions : liste des bibliothécaires réservée à l’administrateur', function () {
    activeUser('bibliothecaire');

    Sanctum::actingAs(activeUser('bibliothecaire'));
    $this->getJson('/api/bibliothecaires')->assertForbidden();

    Sanctum::actingAs(activeUser('administrateur'));
    $this->getJson('/api/bibliothecaires')->assertOk();
});
