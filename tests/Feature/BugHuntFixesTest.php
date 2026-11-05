<?php

// Correctifs issus de la revue complète du projet (novembre 2026).

use App\Jobs\NotifyDocumentPublishedJob;
use App\Models\AccountRequest;
use App\Models\AppNotification;
use App\Models\Document;
use App\Models\Library;
use App\Models\Permission;
use App\Models\ReadingProgress;
use App\Models\StaffMessage;
use App\Models\User;
use App\Services\DocumentPublisher;
use App\Support\SimpleXlsx;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

function bugHuntAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

test('l\'assistant accepte un historique contenant une image générée (réponse texte vide)', function () {
    config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'm-main', 'services.gemini.fallback_models' => []]);
    Http::fake(['*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => 'Réponse']]]]]])]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $response = $this->postJson("/api/documents/{$document->slug}/ask", [
        'question' => 'Et ensuite ?',
        'history' => [['question' => 'Dessine un schéma', 'answer' => '']],
    ]);

    expect($response->status())->not->toBe(422);
});

test('deux bibliothèques du même nom reçoivent des slugs distincts', function () {
    $a = Library::factory()->create(['name' => 'Bibliothèque Centrale', 'slug' => null]);
    $b = Library::factory()->create(['name' => 'Bibliothèque Centrale', 'slug' => null]);

    expect($a->slug)->toBe('bibliotheque-centrale')->and($b->slug)->toBe('bibliotheque-centrale-2');
});

test('le slug d\'un document au titre très long tient dans la colonne', function () {
    $document = Document::factory()->create(['title' => str_repeat('Titre ', 42), 'slug' => null]);

    expect(strlen($document->slug))->toBeLessThanOrEqual(255);
});

test('une date de programmation avec décalage horaire est convertie en UTC', function () {
    $this->travelTo(now()->startOfMinute());
    $document = Document::factory()->create(['status' => 'brouillon']);
    Sanctum::actingAs(bugHuntAdmin());

    $local = now()->addDay()->setTimezone('+03:00')->format('Y-m-d\TH:i:sP');
    $this->postJson("/api/documents/{$document->id}/schedule", ['scheduled_at' => $local])->assertOk();

    expect($document->fresh()->scheduled_at->equalTo(now()->addDay()))->toBeTrue();
});

test('un classeur .xlsx sans références de cellules est lu dans l\'ordre', function () {
    $path = tempnam(sys_get_temp_dir(), 'xlsx');
    $zip = new ZipArchive();
    $zip->open($path, ZipArchive::OVERWRITE);
    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    $zip->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="F" sheetId="1" r:id="rId1"/></sheets></workbook>');
    $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    $zip->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        . '<row><c t="inlineStr"><is><t>Titre</t></is></c><c t="inlineStr"><is><t>Type</t></is></c></row>'
        . '<row><c t="inlineStr"><is><t>Mon livre</t></is></c><c t="inlineStr"><is><t>Livre</t></is></c></row>'
        . '</sheetData></worksheet>');
    $zip->close();

    expect(SimpleXlsx::readFirstSheet($path))->toBe([
        1 => [0 => 'Titre', 1 => 'Type'],
        2 => [0 => 'Mon livre', 1 => 'Livre'],
    ]);
    @unlink($path);
});

test('une demande expirée ne peut plus être vérifiée ni validée', function () {
    $library = Library::factory()->create();
    $request = AccountRequest::factory()->create(['library_id' => $library->id, 'status' => 'en_attente', 'expires_at' => now()->subDays(5)]);
    Sanctum::actingAs(bugHuntAdmin());

    $this->postJson("/api/account-requests/{$request->id}/verify")->assertStatus(422);
    expect($request->fresh()->status)->toBe('expiree');

    $this->postJson("/api/account-requests/{$request->id}/validate")->assertStatus(422);
    expect($request->fresh()->created_user_id)->toBeNull();
});

test('la permission valider_demande_compte existe et peut être attribuée', function () {
    expect(Permission::where('name', 'valider_demande_compte')->exists())->toBeTrue();
});

test('le bibliothécaire voit les messages d\'un second administrateur et lui répond', function () {
    $admin1 = bugHuntAdmin(); // premier administrateur actif
    $admin2 = bugHuntAdmin();
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);

    Sanctum::actingAs($admin2);
    $this->postJson('/api/staff-discussions/messages', ['recipient_id' => $librarian->id, 'message' => 'Bonjour de l\'admin 2'])->assertCreated();

    Sanctum::actingAs($librarian);
    $conversation = $this->getJson('/api/staff-discussions/my-conversation')->assertOk()->json('conversation');
    $messages = $this->getJson("/api/staff-discussions/{$conversation['id']}/messages")->assertOk()->json('messages');
    expect(array_column($messages, 'message'))->toContain('Bonjour de l\'admin 2');
    expect(StaffMessage::where('recipient_id', $librarian->id)->whereNull('read_at')->count())->toBe(0);

    $this->postJson('/api/staff-discussions/messages', ['recipient_id' => $admin1->id, 'message' => 'Réponse'])->assertCreated();
    expect(StaffMessage::where('message', 'Réponse')->value('recipient_id'))->toBe($admin2->id);
});

test('publier un document déjà publié entre-temps ne renotifie personne', function () {
    Bus::fake();
    $document = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()]);
    $stale = Document::find($document->id);

    DocumentPublisher::publish($document, null);
    DocumentPublisher::publish($stale, null); // même document, chargé avant la première publication

    Bus::assertDispatchedTimes(NotifyDocumentPublishedJob::class, 1);
});

test('la progression reste bornée au nombre de pages déjà connu', function () {
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    ReadingProgress::create(['user_id' => $user->id, 'document_id' => $document->id, 'last_page' => 2, 'total_pages' => 10]);
    Sanctum::actingAs($user);

    $this->putJson("/api/documents/{$document->slug}/progress", ['page' => 50])->assertOk()->assertJsonPath('last_page', 10);
});

test('QCM : un choix vide ne décale pas la bonne réponse', function () {
    config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'm-main', 'services.gemini.fallback_models' => []]);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    $document->chunks()->create(['page_number' => 1, 'chunk_index' => 0, 'content' => 'Texte page 1', 'embedding' => [1, 0]]);
    Http::fake(['*:generateContent' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode(['questions' => [
        ['question' => 'Q', 'choices' => ['A', '', 'C', 'D'], 'answer' => 2, 'page' => 1],
        ['question' => 'Vide', 'choices' => ['A', '', 'C'], 'answer' => 1, 'page' => 1],
    ]])]]]]]])]);
    Sanctum::actingAs(User::factory()->create(['role' => 'enseignant', 'is_active' => true]));

    $questions = $this->postJson("/api/documents/{$document->slug}/revision-questions", ['type' => 'qcm', 'count' => 10])
        ->assertOk()->json('questions');

    expect($questions)->toHaveCount(1)
        ->and($questions[0]['choices'][$questions[0]['answer']])->toBe('C');
});

test('une actualité notifie tous les utilisateurs actifs', function () {
    $admin = bugHuntAdmin();
    User::factory()->count(3)->create(['is_active' => true]);
    Sanctum::actingAs($admin);

    $this->postJson('/api/site-updates', ['title' => 'Nouveauté', 'description' => 'Détails'])->assertCreated();

    expect(AppNotification::where('type', 'mise_a_jour_site')->count())->toBe(User::where('is_active', true)->count());
});
