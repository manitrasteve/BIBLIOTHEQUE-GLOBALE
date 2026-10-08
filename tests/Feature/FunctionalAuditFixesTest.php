<?php

use App\Models\Document;
use App\Models\Feedback;
use App\Models\ProblemReport;
use App\Models\ReadingProgress;
use App\Models\TeacherClass;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

// Corrections issues de l'audit fonctionnel du 08/10/2026.

test('un document lu en entier reste « lu » quand l’étudiant revient sur une page précédente', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true]);
    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'ISSTM', 'level' => 'L1']);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'school' => 'ISSTM', 'niveau_detail' => 'L1']);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);

    Sanctum::actingAs($teacher);
    $list = $this->postJson('/api/course-lists', ['title' => 'Cours', 'school' => 'ISSTM', 'level' => 'L1'])->json();
    $this->postJson("/api/course-lists/{$list['id']}/items", ['slug' => $document->slug])->assertCreated();

    Sanctum::actingAs($student);
    $this->putJson("/api/documents/{$document->slug}/progress", ['page' => 10, 'total_pages' => 10])->assertOk();
    $this->putJson("/api/documents/{$document->slug}/progress", ['page' => 3, 'total_pages' => 10])
        ->assertOk()->assertJsonPath('last_page', 3);

    expect(ReadingProgress::first()->isCompleted())->toBeTrue();
    $this->getJson('/api/my-course-lists')->assertJsonPath('0.items.0.reading', 'lu');
});

test('une progression partielle n’est pas marquée lue', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    Sanctum::actingAs($student);

    $this->putJson("/api/documents/{$document->slug}/progress", ['page' => 9, 'total_pages' => 10])->assertOk()
        ->assertJsonPath('completed_at', null);
});

function revisionDocumentWith(array $questions): Document
{
    config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'm-main', 'services.gemini.fallback_models' => []]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    foreach ([1, 2, 3, 8] as $i => $page) {
        $document->chunks()->create(['page_number' => $page, 'chunk_index' => $i, 'content' => "Texte page {$page}", 'embedding' => [1, 0]]);
    }
    Http::fake(['*:generateContent' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode(['questions' => $questions])]]]]]])]);
    Sanctum::actingAs(User::factory()->create(['role' => 'enseignant', 'is_active' => true]));

    return $document;
}

test('la bonne réponse d’un QCM donnée en lettre ou en texte désigne le bon choix', function () {
    $document = revisionDocumentWith([
        ['question' => 'Lettre', 'choices' => ['a1', 'b1', 'c1'], 'answer' => 'C', 'page' => 1],
        ['question' => 'Lettre avec parenthèse', 'choices' => ['a1', 'b1', 'c1'], 'answer' => 'b)', 'page' => 1],
        ['question' => 'Texte du choix', 'choices' => ['Rouge', 'Vert'], 'answer' => 'vert', 'page' => 1],
        ['question' => 'Index en texte', 'choices' => ['x', 'y'], 'answer' => '1', 'page' => 1],
        ['question' => 'Illisible', 'choices' => ['x', 'y'], 'answer' => 'aucune idée', 'page' => 1],
    ]);

    $questions = $this->postJson("/api/documents/{$document->slug}/revision-questions", ['type' => 'qcm', 'count' => 10])
        ->assertOk()->json('questions');

    expect(array_column($questions, 'answer', 'question'))->toBe([
        'Lettre' => 2, 'Lettre avec parenthèse' => 1, 'Texte du choix' => 1, 'Index en texte' => 1,
    ]);
});

test('vrai/faux : « faux » est faux et une réponse non reconnue est écartée', function () {
    $document = revisionDocumentWith([
        ['question' => 'A', 'answer' => 'Faux', 'page' => 1],
        ['question' => 'B', 'answer' => 'vrai', 'page' => 1],
        ['question' => 'C', 'answer' => 'peut-être', 'page' => 1],
    ]);

    $questions = $this->postJson("/api/documents/{$document->slug}/revision-questions", ['type' => 'vrai_faux', 'count' => 10])
        ->assertOk()->json('questions');

    expect(array_column($questions, 'answer', 'question'))->toBe(['A' => false, 'B' => true]);
});

test('les questions de révision acceptent « jusqu’à la page N » sans page de début', function () {
    $document = revisionDocumentWith([['question' => 'Q', 'answer' => 'R', 'page' => 2]]);

    $this->postJson("/api/documents/{$document->slug}/revision-questions", ['type' => 'ouverte', 'count' => 1, 'page_to' => 3])
        ->assertOk()->assertJsonPath('questions.0.page', 2);
    $this->postJson("/api/documents/{$document->slug}/revision-questions", ['type' => 'ouverte', 'count' => 1, 'page_from' => 5, 'page_to' => 3])
        ->assertUnprocessable();
});

test('la réponse à un avis ou à un signalement ne renvoie pas le lecteur vers une page d’administration', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $feedback = Feedback::create(['user_id' => $student->id, 'type' => 'general', 'subject' => 'Sujet', 'message' => 'Message']);
    $report = ProblemReport::create(['user_id' => $student->id, 'type' => 'autre', 'subject' => 'Sujet', 'description' => 'Description']);
    NotificationService::send($student, 'reponse_avis', 'Réponse à votre avis', 'Merci', $feedback);
    NotificationService::send($student, 'reponse_signalement', 'Réponse à votre signalement', 'Corrigé', $report);

    Sanctum::actingAs($student);
    $urls = collect($this->getJson('/api/notifications')->assertOk()->json('data'))->pluck('related_url')->all();

    expect($urls)->toBe([null, null]);
});

test('l’administrateur garde le lien vers la gestion des avis', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $feedback = Feedback::create(['user_id' => $admin->id, 'type' => 'general', 'subject' => 'Sujet', 'message' => 'Message']);
    NotificationService::send($admin, 'nouvel_avis', 'Nouvel avis', 'Sujet', $feedback);

    Sanctum::actingAs($admin);
    $this->getJson('/api/notifications')->assertJsonPath('data.0.related_url', '/administrateur/avis');
});

test('la recherche publique ignore un paramètre texte envoyé en tableau au lieu d’échouer', function () {
    $this->getJson('/api/documents?q[]=x')->assertOk();
    $this->getJson('/api/documents?author[]=x')->assertOk();
    $this->getJson('/api/documents/suggestions?q[]=xx')->assertOk()->assertJson(['documents' => [], 'authors' => []]);
});
