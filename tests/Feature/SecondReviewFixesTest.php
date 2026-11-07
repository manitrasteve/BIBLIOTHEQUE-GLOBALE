<?php

// Corrections issues de la seconde revue du backend : limites de débit, assistant en flux, comptes
// restaurés, validation, notifications, nettoyage des fichiers, fichiers Excel malformés.

use App\Models\AccountRequest;
use App\Models\AppNotification;
use App\Models\Author;
use App\Models\Category;
use App\Models\Consultation;
use App\Models\CourseList;
use App\Models\Document;
use App\Models\Library;
use App\Models\MemberRegistry;
use App\Models\ProblemReport;
use App\Models\ReadingProgress;
use App\Models\StaffConversation;
use App\Models\StaffMessage;
use App\Models\TeacherClass;
use App\Models\User;
use App\Services\AccountProvisioner;
use App\Services\GeminiClient;
use App\Services\SetupLinkReminder;
use App\Services\WeeklyDigest;
use App\Support\HomepageSchema;
use App\Support\LocalTimeFilter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['mail.default' => 'array']);
});

function secondAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

function secondTeacher(string $school = 'ISSTM', array $levels = ['L1']): User
{
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'school' => $school]);
    foreach ($levels as $level) {
        TeacherClass::create(['user_id' => $teacher->id, 'school' => $school, 'level' => $level]);
    }

    return $teacher;
}

function secondXlsx(array $parts): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'xlsx') . '.xlsx';
    $zip = new ZipArchive();
    $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    foreach ($parts as $name => $content) {
        $zip->addFromString($name, $content);
    }
    $zip->close();

    return new UploadedFile($path, 'lot.xlsx', 'application/zip', null, true);
}

// ------------------------------------------------------------------ A. Régressions

test('chaque route limitée a son propre compteur : la progression de lecture n’épuise pas les avis', function () {
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'public']);
    Sanctum::actingAs($member);

    foreach (range(1, 11) as $page) {
        $this->putJson("/api/documents/{$document->slug}/progress", ['page' => $page])->assertOk();
    }

    expect($this->postJson('/api/feedbacks', [])->status())->not->toBe(429);
});

test('aucune route de l’API ne partage son compteur de limite de débit', function () {
    $throttles = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'api/'))
        ->flatMap(fn ($route) => collect($route->gatherMiddleware())->filter(fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'))->all())
        ->values();

    expect($throttles->filter(fn ($m) => substr_count($m, ',') === 1)->values()->all())->toBe([])
        ->and($throttles->reject(fn ($m) => $m === 'throttle:login')->duplicates()->all())->toBe([]);
});

test('le changement de mot de passe et le profil sont limités', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'password' => Hash::make('secret123')]);
    Sanctum::actingAs($user);

    foreach (range(1, 10) as $i) {
        $this->postJson('/api/change-password', ['current_password' => 'faux', 'password' => 'nouveau-123', 'password_confirmation' => 'nouveau-123'])->assertStatus(422);
    }

    $this->postJson('/api/change-password', ['current_password' => 'faux', 'password' => 'nouveau-123', 'password_confirmation' => 'nouveau-123'])->assertStatus(429);
});

test('le flux de génération neutralise les signatures de réflexion en changeant de modèle', function () {
    config([
        'services.gemini.model' => 'modele-a',
        'services.gemini.fallback_models' => ['modele-b'],
        'services.gemini.api_key' => 'k',
    ]);
    Cache::flush();

    $bodies = [];
    Http::fake(function ($request) use (&$bodies) {
        $bodies[] = ['url' => $request->url(), 'body' => $request->data()];

        return str_contains($request->url(), 'modele-a')
            ? Http::response('indisponible', 503)
            : Http::response("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}\n\n", 200);
    });

    $contents = [
        ['role' => 'user', 'parts' => [['text' => 'q']]],
        ['role' => 'model', 'parts' => [['functionCall' => ['name' => 'x', 'args' => new stdClass()], 'thoughtSignature' => 'sig-a']]],
    ];

    $result = app(GeminiClient::class)->streamContents($contents, fn () => null, ['history_model' => 'modele-a']);

    expect($result['model'])->toBe('modele-b');
    $first = collect($bodies)->first(fn ($b) => str_contains($b['url'], 'modele-a'));
    $second = collect($bodies)->first(fn ($b) => str_contains($b['url'], 'modele-b'));
    expect($first['body']['contents'][1]['parts'][0]['thoughtSignature'])->toBe('sig-a')
        ->and($second['body']['contents'][1]['parts'][0]['thoughtSignature'])->toBe('skip_thought_signature_validator')
        ->and($second['body'])->not->toHaveKey('history_model');
});

test('le lien d’un compte restauré peut être renvoyé', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'restaure@example.test']);
    $request = AccountRequest::factory()->create(['email' => 'restaure@example.test', 'created_user_id' => $user->id, 'status' => 'validee']);
    Sanctum::actingAs(secondAdmin());

    $this->deleteJson("/api/users/{$user->id}", ['reason' => 'test'])->assertOk();
    $this->postJson("/api/trash/users/{$user->id}/restore")->assertOk();
    expect($user->fresh()->is_active)->toBeFalse();
    $before = $request->fresh()->setup_token_hash;

    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")->assertOk();

    expect($request->fresh()->setup_token_hash)->not->toBe($before);
});

test('le renvoi et le rappel utilisent l’adresse actuelle du compte', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'nouvelle@example.test', 'password_set_at' => null]);
    $request = AccountRequest::factory()->create([
        'email' => 'ancienne@example.test', 'created_user_id' => $user->id, 'status' => 'validee',
        'setup_token_hash' => Hash::make('x'), 'setup_expires_at' => now()->addHours(5),
    ]);
    Sanctum::actingAs(secondAdmin());

    expect(app(SetupLinkReminder::class)->sendDue())->toBe(1);
    $sent = Mail::mailer('array')->getSymfonyTransport()->messages();
    expect($sent->last()->getEnvelope()->getRecipients()[0]->getAddress())->toBe('nouvelle@example.test');

    $this->postJson("/api/account-requests/{$request->id}/resend-setup-link")
        ->assertOk()
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'nouvelle@example.test'));
});

test('le fil du bibliothécaire indique l’administrateur que sa réponse atteindra', function () {
    $first = secondAdmin();
    $second = secondAdmin();
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);
    $conversation = StaffConversation::create(['admin_id' => $first->id, 'librarian_id' => $librarian->id]);
    $other = StaffConversation::create(['admin_id' => $second->id, 'librarian_id' => $librarian->id]);
    StaffMessage::create(['conversation_id' => $conversation->id, 'sender_id' => $first->id, 'recipient_id' => $librarian->id, 'message' => 'a']);
    StaffMessage::create(['conversation_id' => $other->id, 'sender_id' => $second->id, 'recipient_id' => $librarian->id, 'message' => 'b']);

    Sanctum::actingAs($librarian);
    $this->getJson("/api/staff-discussions/{$conversation->id}/messages")
        ->assertOk()
        ->assertJsonPath('interlocutor.id', $second->id)
        ->assertJsonPath('interlocutor.name', $second->name);

    Sanctum::actingAs($first);
    $this->getJson("/api/staff-discussions/{$conversation->id}/messages")->assertOk()->assertJsonPath('interlocutor', null);
});

// ------------------------------------------------------------------ B. Documents

test('le personnel lit le PDF d’un document non publié, sans compter de consultation', function () {
    Storage::fake('local');
    $document = Document::factory()->create(['status' => 'soumis']);
    Storage::disk('local')->put($document->file_path, '%PDF');

    $this->getJson("/api/documents-manage/{$document->id}/stream")->assertUnauthorized();

    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));
    $this->getJson("/api/documents-manage/{$document->id}/stream")->assertForbidden();

    Sanctum::actingAs(secondAdmin());
    $response = $this->get("/api/documents-manage/{$document->id}/stream");
    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toBe('application/pdf')
        ->and($response->headers->get('Content-Disposition'))->toBe('inline')
        ->and(Consultation::count())->toBe(0);

    Storage::disk('local')->delete($document->file_path);
    $this->getJson("/api/documents-manage/{$document->id}/stream")->assertNotFound();
});

test('les limites de validation évitent les erreurs de colonne', function () {
    Sanctum::actingAs(secondAdmin());
    $document = Document::factory()->create();
    $library = Library::factory()->create();

    $this->putJson("/api/documents/{$document->id}", ['year' => 1850])->assertOk();
    $this->putJson("/api/documents/{$document->id}", ['year' => 999])->assertUnprocessable();
    $this->putJson("/api/documents/{$document->id}", ['year' => 2156])->assertUnprocessable();
    $this->putJson("/api/documents/{$document->id}", ['keywords' => str_repeat('a', 256)])->assertUnprocessable();
    $this->putJson("/api/documents/{$document->id}", ['abstract' => str_repeat('a', 60001)])->assertUnprocessable();
    $this->putJson("/api/libraries/{$library->id}", ['map_link' => 'https://example.test/' . str_repeat('a', 250)])->assertUnprocessable();
});

test('l’ancienne photo d’une bibliothèque reste si la modification échoue', function () {
    Storage::fake('public');
    Storage::disk('public')->put('libraries/ancienne.jpg', 'x');
    $library = Library::factory()->create(['photo_path' => 'libraries/ancienne.jpg']);
    Sanctum::actingAs(secondAdmin());

    Library::updating(fn () => throw new RuntimeException('base indisponible'));
    $this->post("/api/libraries/{$library->id}", ['photo' => UploadedFile::fake()->image('n.jpg')], ['Accept' => 'application/json'])->assertStatus(500);

    expect(Storage::disk('public')->exists('libraries/ancienne.jpg'))->toBeTrue();
});

test('une photo de bibliothèque remplacée est supprimée après l’enregistrement', function () {
    Storage::fake('public');
    Storage::disk('public')->put('libraries/ancienne.jpg', 'x');
    $library = Library::factory()->create(['photo_path' => 'libraries/ancienne.jpg']);
    Sanctum::actingAs(secondAdmin());

    $this->post("/api/libraries/{$library->id}", ['photo' => UploadedFile::fake()->image('n.jpg')], ['Accept' => 'application/json'])->assertOk();

    expect(Storage::disk('public')->exists('libraries/ancienne.jpg'))->toBeFalse();
});

test('des tableaux à la place d’identifiants sont refusés en 422', function () {
    Storage::fake('local');
    Storage::fake('public');
    $library = Library::factory()->create();
    $category = Category::factory()->create();
    $author = Author::factory()->create();
    $document = Document::factory()->create();
    Sanctum::actingAs(secondAdmin());

    $base = ['title' => 'T', 'type' => 'Livre', 'language' => 'fr', 'access_level' => 'public'];
    foreach ([
        ['library_id' => [$library->id], 'category_id' => $category->id],
        ['library_id' => $library->id, 'category_id' => [$category->id]],
        ['library_id' => $library->id, 'category_id' => $category->id, 'author_ids' => [[$author->id]]],
    ] as $fields) {
        $this->post('/api/documents', $base + $fields + ['file' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertUnprocessable();
    }
    expect(Storage::disk('local')->allFiles('documents'))->toBe([]);

    $this->putJson("/api/documents/{$document->id}", ['library_id' => [$library->id]])->assertUnprocessable();
    $this->putJson("/api/documents/{$document->id}", ['category_id' => [$category->id]])->assertUnprocessable();
    $this->putJson("/api/documents/{$document->id}", ['author_ids' => [[$author->id]]])->assertUnprocessable();

    Sanctum::actingAs(secondTeacher());
    $this->post('/api/teacher-submissions', ['title' => 'T', 'type' => 'x', 'category' => 'Droit', 'library_id' => [$library->id], 'file' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertUnprocessable();
});

test('les auteurs : mise à jour partielle préservée, formulaire complet ou marqueur pour tout retirer', function () {
    Sanctum::actingAs(secondAdmin());
    $document = Document::factory()->create(['language' => 'fr', 'access_level' => 'public']);
    $document->authors()->attach(Author::factory()->create());

    // Mise à jour partielle en formulaire : les auteurs ne bougent pas.
    $this->post("/api/documents/{$document->id}", ['title' => 'Nouveau'], ['Accept' => 'application/json'])->assertOk();
    expect($document->authors()->count())->toBe(1);

    // Formulaire React complet, tous les auteurs décochés : aucune entrée author_ids[].
    $this->post("/api/documents/{$document->id}", ['title' => 'Nouveau', 'type' => 'Livre', 'library_id' => $document->library_id, 'language' => 'fr', 'access_level' => 'public'], ['Accept' => 'application/json'])->assertOk();
    expect($document->authors()->count())->toBe(0);

    // Marqueur explicite pour les autres clients.
    $document->authors()->attach(Author::factory()->create());
    $this->post("/api/documents/{$document->id}", ['title' => 'Autre', 'author_ids_present' => '1'], ['Accept' => 'application/json'])->assertOk();
    expect($document->authors()->count())->toBe(0);
});

test('un dépôt déprogrammé redevient à vérifier ; un document refusé ne peut être ni publié ni programmé', function () {
    Sanctum::actingAs(secondAdmin());
    $teacher = secondTeacher();

    $submission = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->addDay(), 'created_by' => $teacher->id]);
    $this->deleteJson("/api/documents/{$submission->id}/schedule")->assertOk();
    expect($submission->fresh()->status)->toBe('soumis');
    $this->postJson("/api/documents/{$submission->id}/reject", ['reason' => 'À corriger'])->assertOk();

    $this->postJson("/api/documents/{$submission->id}/publish")->assertStatus(422);
    $this->postJson("/api/documents/{$submission->id}/schedule", ['scheduled_at' => now()->addDay()->toIso8601String()])->assertStatus(422);
    expect($submission->fresh()->status)->toBe('refuse');

    $draft = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->addDay(), 'created_by' => secondAdmin()->id]);
    $this->deleteJson("/api/documents/{$draft->id}/schedule")->assertOk();
    expect($draft->fresh()->status)->toBe('brouillon');
});

test('un auteur utilisé ne peut pas être supprimé', function () {
    Sanctum::actingAs(secondAdmin());
    $author = Author::factory()->create();
    $document = Document::factory()->create();
    $document->authors()->attach($author);
    $document->delete(); // la Corbeille compte aussi

    $this->deleteJson("/api/authors/{$author->id}")->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, '1 document'));
    expect($document->authors()->count())->toBe(1);

    $free = Author::factory()->create();
    $this->deleteJson("/api/authors/{$free->id}")->assertOk();
});

test('un bibliothécaire sans bibliothèque est prévenu des modifications de documents', function () {
    Sanctum::actingAs(secondAdmin());
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]);
    $document = Document::factory()->create();

    $this->putJson("/api/documents/{$document->id}", ['title' => 'Changé'])->assertOk();

    expect(AppNotification::where('user_id', $librarian->id)->where('type', 'document_modifie')->count())->toBe(1);
});

// ------------------------------------------------------------------ B. Comptes

test('un compte sans demande restauré perd son ancien mot de passe et reçoit un lien', function () {
    Sanctum::actingAs(secondAdmin());
    $user = User::factory()->create([
        'role' => 'etudiant', 'is_active' => true, 'email' => 'sansdemande@example.test',
        'password' => Hash::make('secret123'), 'password_set_at' => now(), 'matricule' => 'ETU-2026-9999',
    ]);
    MemberRegistry::create(['matricule' => 'ETU-2026-9999', 'user_id' => $user->id, 'role' => 'etudiant', 'last_name' => 'x', 'first_name' => 'y', 'email' => $user->email, 'status' => 'actif', 'profile_data' => []]);

    $this->deleteJson("/api/users/{$user->id}", ['reason' => 'x'])->assertOk();
    $this->postJson("/api/trash/users/{$user->id}/restore")->assertOk()->assertJsonPath('mail_sent', true);

    $fresh = $user->fresh();
    expect(Hash::check('secret123', $fresh->password))->toBeFalse()
        ->and($fresh->password_set_at)->toBeNull()
        ->and($fresh->is_active)->toBeTrue()
        ->and(MemberRegistry::where('user_id', $user->id)->value('status'))->toBe('desactive')
        ->and(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeTrue();
});

test('la restauration signale un e-mail qui n’est pas parti', function () {
    Sanctum::actingAs(secondAdmin());
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $this->deleteJson("/api/users/{$user->id}", ['reason' => 'x'])->assertOk();

    Mail::shouldReceive('send')->andThrow(new RuntimeException('smtp'));
    $this->postJson("/api/trash/users/{$user->id}/restore")->assertOk()->assertJsonPath('mail_sent', false);
});

test('un compte restauré, inactif mais avec un lien valide, reçoit le rappel', function () {
    Sanctum::actingAs(secondAdmin());
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'rappel@example.test', 'password_set_at' => null]);
    $request = AccountRequest::factory()->create(['email' => 'rappel@example.test', 'created_user_id' => $user->id, 'status' => 'validee', 'setup_reminder_sent_at' => now()]);

    $this->deleteJson("/api/users/{$user->id}", ['reason' => 'x'])->assertOk();
    $this->postJson("/api/trash/users/{$user->id}/restore")->assertOk();
    expect($request->fresh()->setup_reminder_sent_at)->toBeNull();

    $this->travelTo($request->fresh()->setup_expires_at->copy()->subHours(5));

    expect(app(SetupLinkReminder::class)->sendDue())->toBe(1);
});

test('la suppression et la purge effacent les liens de mot de passe et la photo', function () {
    Storage::fake('public');
    Storage::disk('public')->put('profiles/p.jpg', 'x');
    Storage::disk('public')->put('profiles/q.jpg', 'x');
    Storage::disk('public')->put('problem-reports/c.jpg', 'x');
    Sanctum::actingAs(secondAdmin());

    $user = User::factory()->create(['role' => 'etudiant', 'photo_path' => 'profiles/p.jpg', 'email' => 'purge@example.test']);
    ProblemReport::create(['user_id' => $user->id, 'type' => 'login', 'subject' => 's', 'description' => 'd', 'screenshot_path' => 'problem-reports/c.jpg']);
    DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => Hash::make('t'), 'created_at' => now()]);

    $this->deleteJson("/api/users/{$user->id}", ['reason' => 'x'])->assertOk();
    expect(DB::table('password_reset_tokens')->where('email', 'purge@example.test')->exists())->toBeFalse()
        ->and(Storage::disk('public')->exists('profiles/p.jpg'))->toBeTrue(); // encore restaurable

    $this->deleteJson("/api/trash/users/{$user->id}")->assertOk();
    expect(Storage::disk('public')->exists('profiles/p.jpg'))->toBeFalse()
        ->and(Storage::disk('public')->exists('problem-reports/c.jpg'))->toBeFalse();

    // Vidage de la Corbeille.
    $other = User::factory()->create(['role' => 'etudiant', 'photo_path' => 'profiles/q.jpg', 'email' => 'vidage@example.test']);
    DB::table('password_reset_tokens')->insert(['email' => $other->email, 'token' => Hash::make('t'), 'created_at' => now()]);
    $other->delete();
    $this->deleteJson('/api/trash')->assertOk();
    expect(Storage::disk('public')->exists('profiles/q.jpg'))->toBeFalse()
        ->and(User::withTrashed()->find($other->id))->toBeNull()
        ->and(DB::table('password_reset_tokens')->where('email', 'vidage@example.test')->exists())->toBeFalse();
});

test('supprimer un signalement ou vider l’historique efface les captures ; screenshot_url est exposé', function () {
    Storage::fake('public');
    Storage::disk('public')->put('problem-reports/a.jpg', 'x');
    Storage::disk('public')->put('problem-reports/b.jpg', 'x');
    Sanctum::actingAs(secondAdmin());
    $user = User::factory()->create(['role' => 'etudiant']);

    $a = ProblemReport::create(['user_id' => $user->id, 'type' => 'login', 'subject' => 's', 'description' => 'd', 'screenshot_path' => 'problem-reports/a.jpg']);
    $b = ProblemReport::create(['user_id' => $user->id, 'type' => 'login', 'subject' => 's', 'description' => 'd', 'screenshot_path' => 'problem-reports/b.jpg']);
    $none = ProblemReport::create(['user_id' => $user->id, 'type' => 'login', 'subject' => 's', 'description' => 'd']);

    expect($a->toArray()['screenshot_url'])->toBe('/storage/problem-reports/a.jpg')
        ->and($none->toArray()['screenshot_url'])->toBeNull();

    $this->deleteJson("/api/problem-reports/{$a->id}")->assertOk();
    expect(Storage::disk('public')->exists('problem-reports/a.jpg'))->toBeFalse();

    $this->deleteJson('/api/problem-reports/clear-all')->assertOk();
    expect(Storage::disk('public')->exists('problem-reports/b.jpg'))->toBeFalse()
        ->and(ProblemReport::count())->toBe(0);
});

test('création de bibliothécaire : date de CIN future refusée', function () {
    Sanctum::actingAs(secondAdmin());

    $this->postJson('/api/librarians', [
        'last_name' => 'Bib', 'email' => 'bib@example.test', 'phone' => '0340000000', 'address' => 'x',
        'gender' => 'masculin', 'cin_number' => '123456789012', 'cin_issued_at' => now()->addDay()->toDateString(),
    ])->assertUnprocessable();

    expect(User::where('email', 'bib@example.test')->exists())->toBeFalse();
});

test('le SMS d’activation salue avec le prénom du registre', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'phone' => '0341234567', 'matricule' => 'ETU-2026-7777']);
    MemberRegistry::create(['matricule' => 'ETU-2026-7777', 'user_id' => $user->id, 'role' => 'etudiant', 'last_name' => 'R', 'first_name' => 'Lala', 'email' => $user->email, 'status' => 'desactive', 'profile_data' => []]);

    $sms = Mockery::mock(\App\Services\SmsService::class);
    $sms->shouldReceive('send')->once()->withArgs(fn ($phone, $text) => str_contains($text, 'Bonjour Lala, votre compte'));
    app()->instance(\App\Services\SmsService::class, $sms);

    app(AccountProvisioner::class)->sendActivationSms($user);
});

// ------------------------------------------------------------------ B. Espace enseignant et lecture

test('une bibliographie refuse un document restreint', function () {
    $teacher = secondTeacher();
    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'L', 'school' => 'ISSTM', 'level' => 'L1']);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'restreint']);
    Sanctum::actingAs($teacher);

    $this->postJson("/api/course-lists/{$list->id}/items", ['slug' => $document->slug])
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'restreint'));
});

test('une bibliographie reste modifiable après le retrait du niveau, mais pas déplaçable vers une autre classe', function () {
    $teacher = secondTeacher('ISSTM', ['L1', 'M1']);
    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'L', 'school' => 'ISSTM', 'level' => 'L1']);
    Sanctum::actingAs($teacher);

    $this->putJson('/api/teacher-config', ['levels' => ['M1']])->assertOk();

    $this->putJson("/api/course-lists/{$list->id}", ['title' => 'Renommée', 'school' => 'ISSTM', 'level' => 'L1'])->assertOk();
    $this->putJson("/api/course-lists/{$list->id}", ['title' => 'Renommée', 'school' => 'ISSTM', 'level' => 'L2'])->assertStatus(422);
});

test('la configuration de l’enseignant ne touche pas aux classes d’un autre établissement', function () {
    $teacher = secondTeacher('ISSTM', ['L1']);
    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'IOSTM', 'level' => 'M2']);
    Sanctum::actingAs($teacher);

    $this->putJson('/api/teacher-config', ['levels' => ['L2']])->assertOk();

    expect($teacher->teachesClass('IOSTM', 'M2'))->toBeTrue()
        ->and($teacher->teachesClass('ISSTM', 'L2'))->toBeTrue()
        ->and($teacher->teachesClass('ISSTM', 'L1'))->toBeFalse();
});

test('date limite passée refusée seulement si elle change ; rappel refusé pour un document retiré', function () {
    $teacher = secondTeacher();
    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'L', 'school' => 'ISSTM', 'level' => 'L1']);
    $document = Document::factory()->create(['status' => 'publie']);
    $item = $list->items()->create(['document_id' => $document->id, 'due_date' => now()->subDays(3)->toDateString(), 'position' => 1]);
    Sanctum::actingAs($teacher);

    $past = now()->subDays(3)->toDateString();
    $this->putJson("/api/course-lists/{$list->id}/items/{$item->id}", ['instruction' => 'Lire', 'due_date' => $past])->assertOk();
    $this->putJson("/api/course-lists/{$list->id}/items/{$item->id}", ['due_date' => now()->subDay()->toDateString()])->assertUnprocessable();

    $document->update(['status' => 'archive']);
    $this->postJson("/api/course-lists/{$list->id}/items/{$item->id}/remind")->assertStatus(422);
});

test('le tableau de bord n’affiche ni document supprimé ni lecture terminée en cours', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $trashed = Document::factory()->create(['status' => 'publie', 'title' => 'Corbeille']);
    $done = Document::factory()->create(['status' => 'publie', 'title' => 'Fini']);
    $current = Document::factory()->create(['status' => 'publie', 'title' => 'En cours']);
    ReadingProgress::create(['user_id' => $user->id, 'document_id' => $trashed->id, 'last_page' => 3, 'total_pages' => 10]);
    ReadingProgress::create(['user_id' => $user->id, 'document_id' => $done->id, 'last_page' => 10, 'total_pages' => 10]);
    ReadingProgress::create(['user_id' => $user->id, 'document_id' => $current->id, 'last_page' => 2, 'total_pages' => 10]);
    $trashed->delete();
    Sanctum::actingAs($user);

    expect(collect($this->getJson('/api/dashboard/me')->json('current_readings'))->pluck('title')->all())->toBe(['En cours']);
});

test('les statistiques de lecture ignorent les documents en corbeille', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $kept = Document::factory()->create(['status' => 'publie']);
    $trashed = Document::factory()->create(['status' => 'publie']);
    Consultation::create(['user_id' => $user->id, 'document_id' => $kept->id]);
    Consultation::create(['user_id' => $user->id, 'document_id' => $trashed->id]);
    $trashed->delete();
    Sanctum::actingAs($user);

    $this->getJson('/api/profile/reading-stats')->assertOk()->assertJsonPath('documents_read', 1);
});

test('« Mes lectures » se filtre par titre', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $match = Document::factory()->create(['status' => 'publie', 'title' => 'Algèbre linéaire']);
    $other = Document::factory()->create(['status' => 'publie', 'title' => 'Droit civil']);
    Consultation::create(['user_id' => $user->id, 'document_id' => $match->id]);
    Consultation::create(['user_id' => $user->id, 'document_id' => $other->id]);
    Sanctum::actingAs($user);

    $this->getJson('/api/mes-lectures')->assertOk()->assertJsonPath('total', 2);
    $this->getJson('/api/mes-lectures?search=algèbre')->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('data.0.title', 'Algèbre linéaire');
    $this->getJson('/api/mes-lectures?search[]=x')->assertUnprocessable();
});

test('le niveau du profil suit les listes de création seulement s’il change', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'email' => 'p@example.test', 'niveau_type' => 'Lycée', 'niveau_detail' => 'Troisième année']);
    Sanctum::actingAs($user);

    // Valeurs historiques en texte libre, inchangées : le profil reste enregistrable.
    $this->postJson('/api/profile', ['email' => 'p@example.test', 'niveau_type' => 'Lycée', 'niveau_detail' => 'Troisième année', 'phone' => '034'])->assertOk();

    $this->postJson('/api/profile', ['email' => 'p@example.test', 'niveau_detail' => 'Quatrième année'])->assertUnprocessable();
    $this->postJson('/api/profile', ['email' => 'p@example.test', 'niveau_type' => 'Autre'])->assertUnprocessable();
    $this->postJson('/api/profile', ['email' => 'p@example.test', 'niveau_type' => 'Université', 'niveau_detail' => 'M1'])->assertOk();
    $this->postJson('/api/profile', ['email' => 'p@example.test', 'niveau_type' => null, 'niveau_detail' => null])->assertOk();
});

test('le dépôt d’un enseignant renvoie sa catégorie', function () {
    Storage::fake('local');
    Library::factory()->create();
    Sanctum::actingAs(secondTeacher());

    $this->post('/api/teacher-submissions', ['title' => 'Cours', 'type' => 'Polycopié', 'category' => 'Droit', 'file' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
        ->assertCreated()
        ->assertJsonPath('category.name', 'Droit');
});

// ------------------------------------------------------------------ B. Robustesse

test('le digest réessaie si aucun envoi n’a abouti, pas après un envoi partiel', function () {
    $this->travelTo(now('Indian/Antananarivo')->next('Monday')->setTime(9, 0));
    User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    Document::factory()->create(['status' => 'publie', 'published_at' => now()]);

    Mail::shouldReceive('send')->once()->andThrow(new RuntimeException('smtp'));
    expect(app(WeeklyDigest::class)->sendThisWeekOnce())->toBe(0)
        ->and(app(WeeklyDigest::class)->isDue())->toBeTrue();

    Mail::shouldReceive('send')->once();
    expect(app(WeeklyDigest::class)->sendThisWeekOnce())->toBe(1)
        ->and(app(WeeklyDigest::class)->isDue())->toBeFalse();
});

test('un classeur Excel malformé donne un 422', function () {
    Sanctum::actingAs(secondAdmin());

    $this->post('/api/document-imports/analyze', ['excel' => secondXlsx(['xl/workbook.xml' => '<pas-du-xml'])], ['Accept' => 'application/json'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('excel');

    $workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="a" sheetId="1" r:id="rId1"/></sheets></workbook>';
    $rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>';
    $sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="ZZZZZZZZZZZZZZZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>';

    $this->post('/api/document-imports/analyze', ['excel' => secondXlsx(['xl/workbook.xml' => $workbook, 'xl/_rels/workbook.xml.rels' => $rels, 'xl/worksheets/sheet1.xml' => $sheet])], ['Accept' => 'application/json'])
        ->assertUnprocessable();
});

test('l’import accepte une année ancienne et refuse une année hors limites', function () {
    Sanctum::actingAs(secondAdmin());
    $library = Library::factory()->create();
    $header = ['Titre', 'Type', 'Catégorie', 'Bibliothèque', 'Année', 'Langue', 'Nom du fichier PDF'];
    $rows = [$header, ['Ancien', 'Livre', 'Droit', $library->name, '1850', 'Français', 'a.pdf'], ['Hors limite', 'Livre', 'Droit', $library->name, '999', 'Français', 'b.pdf']];
    $path = tempnam(sys_get_temp_dir(), 'xlsx') . '.xlsx';
    file_put_contents($path, \App\Support\SimpleXlsx::build([['name' => 'Documents', 'rows' => $rows]]));

    $response = $this->post('/api/document-imports/analyze', [
        'excel' => new UploadedFile($path, 'lot.xlsx', 'application/zip', null, true),
        'pdfs' => [['name' => 'a.pdf', 'size' => 10], ['name' => 'b.pdf', 'size' => 10]],
    ], ['Accept' => 'application/json'])->assertOk();

    expect($response->json('rows.0.status'))->toBe('valid')
        ->and($response->json('rows.1.status'))->toBe('error')
        ->and($response->json('rows.1.errors.0'))->toContain('Année');
});

test('un identifiant non numérique ou trop grand donne un 404', function () {
    Sanctum::actingAs(secondAdmin());

    $this->postJson('/api/trash/users/abc/restore')->assertNotFound();
    $this->postJson('/api/trash/documents/abc/restore')->assertNotFound();
    $this->deleteJson('/api/trash/users/abc')->assertNotFound();
    $this->deleteJson('/api/trash/documents/abc')->assertNotFound();
    $this->postJson('/api/trash/users/99999999999999999999/restore')->assertNotFound();
    $this->getJson('/api/admin/homepage/versions/99999999999999999999')->assertNotFound();
    $this->postJson('/api/admin/homepage/versions/99999999999999999999/restore')->assertNotFound();
});

test('une saisie qui n’est pas de l’UTF-8 valide est refusée en 422', function () {
    Sanctum::actingAs(secondAdmin());

    $this->post('/api/authors', ['name' => "ab\xFFcd"], ['Accept' => 'application/json'])->assertStatus(422);
    $this->post('/api/categories', ['name' => "ab\xFFcd"], ['Accept' => 'application/json'])->assertStatus(422);
    $this->get('/api/authors?search=%FF', ['Accept' => 'application/json'])->assertStatus(422);
    expect(Author::count())->toBe(0);

    $this->post('/api/authors', ['name' => 'Éloïse Rakoto'], ['Accept' => 'application/json'])->assertCreated();
});

test('une catégorie sans lettre latine obtient un slug de repli et n’est jamais confondue', function () {
    Sanctum::actingAs(secondAdmin());

    $this->postJson('/api/categories', ['name' => '!!!'])->assertCreated();
    expect(Category::where('name', '!!!')->value('slug'))->toStartWith('categorie-');

    $this->postJson('/api/categories', ['name' => '???'])->assertCreated();
    $this->postJson('/api/categories', ['name' => '???'])->assertUnprocessable();

    expect(Category::resolveId('数学'))->not->toBe(Category::resolveId('法律'))
        ->and(Category::resolveId('数学'))->toBe(Category::resolveId('数学'));

    $category = Category::where('name', '!!!')->first();
    $slug = $category->slug;
    $this->putJson("/api/categories/{$category->id}", ['name' => '!!!!'])->assertOk();
    expect($category->fresh()->slug)->toBe($slug);
});

test('retry_after dépasse le plus long des jobs', function () {
    expect(config('queue.connections.database.retry_after'))->toBeGreaterThan((new \App\Jobs\IngestDocumentJob(new Document()))->timeout);
});

test('le filtre horaire n’utilise pas de paramètres liés pour les identifiants', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    \App\Models\ActivityLog::create(['user_id' => $user->id, 'action' => 'x']);

    $query = \App\Models\ActivityLog::query();
    LocalTimeFilter::apply($query, ['time_from' => '00:00']);

    expect($query->getQuery()->getBindings())->toBe([])
        ->and($query->count())->toBe(1);
});

test('une adresse d’API inconnue répond en JSON 404, le frontend reste servi ailleurs', function () {
    $this->getJson('/api/adresse-inconnue')->assertNotFound();
    $this->get('/api/adresse-inconnue')->assertNotFound()->assertHeader('content-type', 'application/json');
    $this->get('/recherche')->assertOk();
    $this->get('/apiculture')->assertOk();
});

test('le schéma de la page d’accueil refuse « .. » et les dossiers', function () {
    Storage::fake('public');
    Storage::disk('public')->put('homepage/a.jpg', 'x');
    $section = fn (string $image) => [['id' => 'a', 'type' => 'image', 'visible' => true, 'content' => ['image' => $image]]];

    expect(HomepageSchema::validate($section('homepage/a.jpg'))[0]['content']['image'])->toBe('homepage/a.jpg');

    foreach (['homepage/..', 'homepage/.', 'homepage/../secret.jpg'] as $image) {
        expect(fn () => HomepageSchema::validate($section($image)))->toThrow(ValidationException::class);
    }
});

test('recipient_count ne compte pas les copies aux administrateurs', function () {
    secondAdmin();
    secondAdmin();
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]));

    $this->postJson('/api/admin-messages', ['subject' => 'S', 'message' => 'M', 'recipient_ids' => [$student->id]])
        ->assertCreated()
        ->assertJsonPath('recipient_count', 1);
});
