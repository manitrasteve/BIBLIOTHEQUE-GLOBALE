<?php

use App\Models\AppNotification;
use App\Models\Consultation;
use App\Models\CourseList;
use App\Models\Document;
use App\Models\Library;
use App\Models\ReadingProgress;
use App\Models\TeacherClass;
use App\Models\User;
use App\Services\DocumentPublisher;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function teacher(array $classes = [['ISSTM', 'L1']]): User
{
    $t = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'name' => 'Dr. Haja']);
    foreach ($classes as [$school, $level]) {
        TeacherClass::create(['user_id' => $t->id, 'school' => $school, 'level' => $level]);
    }

    return $t;
}

function student(string $school = 'ISSTM', string $level = 'L1', ?string $filiere = 'Génie civil'): User
{
    return User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'school' => $school, 'niveau_detail' => $level, 'filiere' => $filiere]);
}

// ------------------------------------------------------------------ Classes attribuées (Service Numérique)

test('le Service Numérique attribue les classes d’un enseignant', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
    $t = teacher([]);
    Sanctum::actingAs($librarian);

    $this->getJson('/api/teachers')->assertOk()->assertJsonPath('data.0.id', $t->id)->assertJsonFragment(['levels' => ['L1', 'L2', 'L3', 'M1', 'M2', 'Doctorat']]);

    $this->putJson("/api/teachers/{$t->id}/classes", ['classes' => [['school' => 'ISSTM', 'level' => 'L1'], ['school' => 'ISSTM', 'level' => 'L1'], ['school' => 'IUGM', 'level' => 'M1']]])
        ->assertOk()->assertJsonCount(2);
    $this->putJson("/api/teachers/{$t->id}/classes", ['classes' => [['school' => 'Inconnu', 'level' => 'L1']]])->assertUnprocessable();

    expect($t->fresh()->teachesClass('ISSTM', 'L1'))->toBeTrue()->and($t->fresh()->teachesClass('ISSTM', 'L2'))->toBeFalse();
});

test('un enseignant ne peut pas s’attribuer des classes lui-même', function () {
    $t = teacher([]);
    Sanctum::actingAs($t);

    $this->putJson("/api/teachers/{$t->id}/classes", ['classes' => [['school' => 'ISSTM', 'level' => 'L1']]])->assertForbidden();
});

// ------------------------------------------------------------------ Bibliographies de cours

test('une bibliographie n’atteint que les étudiants de la classe visée', function () {
    $t = teacher();
    $inClass = student();
    $otherLevel = student('ISSTM', 'L2');
    $otherSchool = student('IUGM', 'L1');
    $document = Document::factory()->create(['status' => 'publie', 'title' => 'Analyse I']);
    Sanctum::actingAs($t);

    $list = $this->postJson('/api/course-lists', ['title' => 'Analyse mathématique I', 'school' => 'ISSTM', 'level' => 'L1'])
        ->assertCreated()->assertJsonPath('audience_count', 1)->json();
    $this->postJson("/api/course-lists/{$list['id']}/items", ['slug' => $document->slug, 'instruction' => 'Chapitre 2', 'due_date' => now()->addWeek()->toDateString()])
        ->assertCreated();

    expect(AppNotification::where('type', 'lecture_recommandee')->pluck('user_id')->all())->toBe([$inClass->id]);

    Sanctum::actingAs($inClass);
    $this->getJson('/api/my-course-lists')->assertOk()->assertJsonPath('0.title', 'Analyse mathématique I')
        ->assertJsonPath('0.items.0.instruction', 'Chapitre 2')->assertJsonPath('0.items.0.reading', 'a_lire');
    foreach ([$otherLevel, $otherSchool] as $outsider) {
        Sanctum::actingAs($outsider);
        $this->getJson('/api/my-course-lists')->assertOk()->assertExactJson([]);
    }
});

test('avec deux enseignants, l’étudiant sait qui envoie chaque lecture', function () {
    $haja = teacher();
    $rasoa = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'name' => 'Pr. Rasoa', 'teaching_specialty' => 'Chimie']);
    TeacherClass::create(['user_id' => $rasoa->id, 'school' => 'ISSTM', 'level' => 'L1']);
    $etudiant = student();
    $analyse = Document::factory()->create(['status' => 'publie', 'title' => 'Analyse I']);
    $chimie = Document::factory()->create(['status' => 'publie', 'title' => 'Chimie générale']);

    CourseList::create(['teacher_id' => $haja->id, 'title' => 'Analyse', 'school' => 'ISSTM', 'level' => 'L1'])->items()->create(['document_id' => $analyse->id]);
    CourseList::create(['teacher_id' => $rasoa->id, 'title' => 'Chimie', 'school' => 'ISSTM', 'level' => 'L1'])->items()->create(['document_id' => $chimie->id]);
    Consultation::create(['user_id' => $etudiant->id, 'document_id' => $analyse->id]);
    Sanctum::actingAs($etudiant);

    $lists = collect($this->getJson('/api/my-course-lists')->assertOk()->json());
    expect($lists->mapWithKeys(fn ($l) => [$l['items'][0]['document']['title'] => $l['teacher']['name']])->all())
        ->toEqual(['Chimie générale' => 'Pr. Rasoa', 'Analyse I' => 'Dr. Haja'])
        ->and($lists->firstWhere('title', 'Chimie')['teacher']['teaching_specialty'])->toBe('Chimie')
        ->and($lists->first()['items'][0]['added_at'])->not->toBeNull();

    // Badge du menu : une seule lecture pas encore ouverte (Chimie générale).
    $this->getJson('/api/nav-badges')->assertJsonPath('recommended', 1);
});

test('un enseignant ne peut viser qu’une classe qui lui est attribuée', function () {
    Sanctum::actingAs(teacher([['ISSTM', 'L1']]));

    $this->postJson('/api/course-lists', ['title' => 'X', 'school' => 'ISSTM', 'level' => 'L3'])->assertStatus(422);
    $this->postJson('/api/course-lists', ['title' => 'X', 'school' => 'IUGM', 'level' => 'L1'])->assertStatus(422);
});

test('le parcours facultatif est comparé sans majuscules ni accents', function () {
    $t = teacher();
    $civil = student(filiere: 'genie CIVIL');
    $info = student(filiere: 'Informatique');
    $list = CourseList::create(['teacher_id' => $t->id, 'title' => 'TP béton', 'school' => 'ISSTM', 'level' => 'L1', 'filiere' => 'Génie civil']);

    expect($list->audience()->pluck('id')->all())->toBe([$civil->id])
        ->and($list->targets($civil))->toBeTrue()
        ->and($list->targets($info))->toBeFalse();
});

test('un enseignant ne voit ni ne modifie la bibliographie d’un autre', function () {
    $owner = teacher();
    $list = CourseList::create(['teacher_id' => $owner->id, 'title' => 'A', 'school' => 'ISSTM', 'level' => 'L1']);
    Sanctum::actingAs(teacher());

    $this->getJson("/api/course-lists/{$list->id}")->assertForbidden();
    $this->deleteJson("/api/course-lists/{$list->id}")->assertForbidden();
});

test('seuls les documents publiés peuvent être recommandés', function () {
    $t = teacher();
    $list = CourseList::create(['teacher_id' => $t->id, 'title' => 'A', 'school' => 'ISSTM', 'level' => 'L1']);
    Sanctum::actingAs($t);

    $this->postJson("/api/course-lists/{$list->id}/items", ['slug' => Document::factory()->create(['status' => 'brouillon'])->slug])->assertNotFound();
});

test('un étudiant ou un chercheur n’accède pas aux outils enseignant', function (string $role) {
    Sanctum::actingAs(User::factory()->create(['role' => $role, 'is_active' => true]));

    $this->getJson('/api/course-lists')->assertForbidden();
    $this->getJson('/api/teacher-submissions')->assertForbidden();
})->with(['etudiant', 'chercheur']);

// ------------------------------------------------------------------ Suivi de lecture

test('le suivi de lecture est anonyme et compte lu, commencé et jamais ouvert', function () {
    $t = teacher();
    $students = collect(range(1, 6))->map(fn () => student());
    $document = Document::factory()->create(['status' => 'publie']);
    $list = CourseList::create(['teacher_id' => $t->id, 'title' => 'A', 'school' => 'ISSTM', 'level' => 'L1']);
    $item = $list->items()->create(['document_id' => $document->id]);

    ReadingProgress::create(['user_id' => $students[0]->id, 'document_id' => $document->id, 'last_page' => 50, 'total_pages' => 50]);
    ReadingProgress::create(['user_id' => $students[1]->id, 'document_id' => $document->id, 'last_page' => 10, 'total_pages' => 50]);
    Consultation::create(['user_id' => $students[2]->id, 'document_id' => $document->id]);
    Sanctum::actingAs($t);

    $response = $this->getJson("/api/course-lists/{$list->id}/progress")->assertOk()
        ->assertJsonPath('audience_count', 6)->assertJsonPath('hidden', false)
        ->assertJsonPath('items.0.done', 1)->assertJsonPath('items.0.started', 2)->assertJsonPath('items.0.never', 3);
    expect($response->getContent())->not->toContain($students[0]->name);

    // Rappel : seulement les 3 étudiants qui n'ont jamais ouvert le document.
    $this->postJson("/api/course-lists/{$list->id}/items/{$item->id}/remind")->assertOk()->assertJsonPath('sent', 3);
    expect(AppNotification::where('title', 'Rappel de lecture')->pluck('user_id')->sort()->values()->all())
        ->toBe($students->slice(3)->pluck('id')->sort()->values()->all());
});

test('le suivi est masqué pour une classe de moins de 5 étudiants', function () {
    $t = teacher();
    student();
    $list = CourseList::create(['teacher_id' => $t->id, 'title' => 'A', 'school' => 'ISSTM', 'level' => 'L1']);
    Sanctum::actingAs($t);

    $this->getJson("/api/course-lists/{$list->id}/progress")->assertOk()->assertJsonPath('hidden', true)->assertJsonPath('items', []);
});

// ------------------------------------------------------------------ Dépôt de supports

test('un dépôt arrive en vérification, puis la publication prévient l’enseignant et l’ajoute à sa bibliographie', function () {
    Storage::fake('local');
    $t = teacher();
    $inClass = student();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $list = CourseList::create(['teacher_id' => $t->id, 'title' => 'Analyse I', 'school' => 'ISSTM', 'level' => 'L1']);
    Sanctum::actingAs($t);

    $id = $this->post('/api/teacher-submissions', [
        'title' => 'TD n°3 : limites', 'type' => 'Travaux dirigés', 'category' => 'Mathématiques',
        'library_id' => Library::factory()->create()->id, 'course_list_id' => $list->id,
        'file' => UploadedFile::fake()->create('td3.pdf', 100, 'application/pdf'),
    ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('status', 'soumis')->json('id');

    expect(AppNotification::where('user_id', $admin->id)->where('type', 'document_ajoute')->exists())->toBeTrue();
    $this->getJson("/api/documents/" . Document::find($id)->slug)->assertNotFound(); // pas encore public

    DocumentPublisher::publish(Document::find($id), $admin->id);

    expect(AppNotification::where('user_id', $t->id)->where('type', 'depot_publie')->exists())->toBeTrue()
        ->and($list->items()->pluck('document_id')->all())->toBe([$id])
        ->and(AppNotification::where('user_id', $inClass->id)->where('type', 'lecture_recommandee')->exists())->toBeTrue();
});

test('un dépôt refusé porte un motif et peut être renvoyé corrigé', function () {
    Storage::fake('local');
    $t = teacher();
    $document = Document::factory()->create(['status' => 'soumis', 'created_by' => $t->id]);
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->postJson("/api/documents/{$document->id}/reject", ['reason' => 'PDF illisible'])->assertOk();
    expect($document->fresh()->status)->toBe('refuse')->and($document->fresh()->review_note)->toBe('PDF illisible')
        ->and(AppNotification::where('user_id', $t->id)->where('type', 'depot_refuse')->exists())->toBeTrue();

    Sanctum::actingAs($t);
    $this->getJson('/api/teacher-submissions')->assertOk()->assertJsonPath('0.review_note', 'PDF illisible');
    $this->post("/api/teacher-submissions/{$document->id}/resubmit", ['file' => UploadedFile::fake()->create('v2.pdf', 50, 'application/pdf')], ['Accept' => 'application/json'])
        ->assertOk()->assertJsonPath('status', 'soumis');

    Sanctum::actingAs(teacher());
    $this->post("/api/teacher-submissions/{$document->id}/resubmit", ['file' => UploadedFile::fake()->create('x.pdf', 50, 'application/pdf')], ['Accept' => 'application/json'])
        ->assertForbidden();
});

// ------------------------------------------------------------------ Questions de révision IA

function revisionSetup(): Document
{
    config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'm-main', 'services.gemini.fallback_models' => []]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    $document->chunks()->create(['page_number' => 94, 'chunk_index' => 0, 'content' => 'Les niveaux d’énergie sont équidistants.', 'embedding' => [1, 0]]);
    $document->chunks()->create(['page_number' => 96, 'chunk_index' => 1, 'content' => 'L’état fondamental vaut ħω/2.', 'embedding' => [1, 0]]);

    return $document;
}

test('les questions générées sont validées et citent une page réelle', function () {
    $document = revisionSetup();
    $json = json_encode(['questions' => [
        ['question' => 'Les niveaux sont :', 'choices' => ['continus', 'équidistants', 'nuls', 'n²'], 'answer' => 1, 'page' => 94],
        ['question' => 'Page inventée', 'choices' => ['a', 'b'], 'answer' => 0, 'page' => 999],
        ['question' => 'Réponse invalide', 'choices' => ['a', 'b'], 'answer' => 5, 'page' => 96],
    ]]);
    Http::fake(['*:generateContent' => Http::response(['candidates' => [['content' => ['parts' => [['text' => $json]]]]]])]);
    Sanctum::actingAs(teacher());

    $questions = $this->postJson("/api/documents/{$document->slug}/revision-questions", ['type' => 'qcm', 'count' => 5])
        ->assertOk()->json('questions');

    expect($questions)->toHaveCount(2)
        ->and($questions[0])->toMatchArray(['answer' => 1, 'page' => 94])
        ->and($questions[1]['page'])->toBeNull();
    Http::assertSent(fn ($request) => ($request['generationConfig']['responseMimeType'] ?? null) === 'application/json');
});

test('un document non indexé donne un message clair', function () {
    config(['services.gemini.key' => 'test-key']);
    Sanctum::actingAs(teacher());

    $this->postJson('/api/documents/' . Document::factory()->create(['status' => 'publie'])->slug . '/revision-questions', ['type' => 'qcm', 'count' => 5])
        ->assertStatus(422)->assertJsonFragment(['message' => 'Ce document n’est pas encore indexé pour l’IA. Réessayez dans quelques minutes ou demandez au Service Numérique de le réindexer.']);
});
