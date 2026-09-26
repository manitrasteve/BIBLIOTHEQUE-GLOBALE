<?php

use App\Models\Document;
use App\Models\User;
use App\Services\DocumentIngestionService;
use App\Services\PdfTextExtractor;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function ragWorld(): array
{
    config([
        'services.gemini.key' => 'test-key',
        'services.gemini.model' => 'm-main',
        'services.gemini.fast_model' => null,
        'services.gemini.fallback_models' => [],
    ]);

    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'authentifie']);
    $document->chunks()->create(['page_number' => 2, 'chunk_index' => 0, 'content' => 'La biodiversité désigne la variété du vivant sur Terre.', 'embedding' => [1.0, 0.0, 0.0]]);
    $document->chunks()->create(['page_number' => 3, 'chunk_index' => 1, 'content' => 'Les écosystèmes marins abritent de nombreuses espèces.', 'embedding' => [0.9, 0.1, 0.0]]);

    return [$document, User::factory()->create(['is_active' => true])];
}

function geminiAnswers(string $text): void
{
    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:generateContent' => Http::response(['candidates' => [['content' => ['parts' => [['text' => $text]]]]]]),
    ]);
}

test('le flux SSE ne perd aucun fragment quand « \\r\\n » est coupé entre deux lectures, ni le dernier événement', function () {
    [$document, $user] = ragWorld();

    $event = fn (string $text) => 'data: ' . json_encode(['candidates' => [['content' => ['parts' => [['text' => $text]]]]]]);
    // Le premier événement est calibré pour que la lecture de 512 octets s'arrête sur « \r\n\r », au milieu du séparateur.
    $first = $event('Selon le document, ');
    $first = $event('Selon le document, ' . str_repeat('x', 512 - 3 - strlen($first)));
    expect(strlen($first) + 3)->toBe(512);
    $sse = $first . "\r\n\r\n" . $event('la biodiversité est la variété du vivant. ') . "\r\n\r\n" . $event('FIN');

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:streamGenerateContent*' => Http::response($sse, 200, ['Content-Type' => 'text/event-stream']),
    ]);

    $body = $this->actingAs($user, 'sanctum')
        ->post("/api/documents/{$document->slug}/ask-stream", ['question' => 'Définis la biodiversité'], ['Accept' => 'text/event-stream'])
        ->assertOk()
        ->streamedContent();

    expect($body)->toContain('la biodiversit')->toContain('FIN')->toContain('event: done');
});

test('une question ciblée contenant « dans ce document » passe par la recherche, pas par un résumé global', function () {
    [$document, $user] = ragWorld();
    geminiAnswers('Selon le document, la biodiversité est la variété du vivant. Source : page 2');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Quelle est la définition de la biodiversité dans ce document ?'])
        ->assertOk();

    expect($response->json('meta.question_type'))->not->toBe('global');
});

test('« De quoi parle ce document ? » reste une question globale', function () {
    [$document, $user] = ragWorld();
    geminiAnswers('Selon le document, il parle du vivant. Source : page 2');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'De quoi parle ce document ?'])
        ->assertOk();

    expect($response->json('meta.question_type'))->toBe('global');
});

test('« Donne un résumé de la page 2 » est analysé par le modèle et non recopié', function () {
    [$document, $user] = ragWorld();
    geminiAnswers('Selon le document, la page 2 définit la biodiversité. Source : page 2');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Donne un résumé de la page 2'])
        ->assertOk();

    expect($response->json('answer'))->not->toContain('Contenu disponible')->toContain('Selon le document');
});

test('« Recopie le texte de la page 2 » renvoie bien le texte brut de la page', function () {
    [$document, $user] = ragWorld();
    Http::fake();

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Recopie le texte de la page 2'])
        ->assertOk();

    expect($response->json('answer'))->toContain('Contenu disponible')->toContain('variété du vivant');
    Http::assertNothingSent();
});

test('les questions sur un document sont limitées en fréquence (coût Gemini)', function () {
    [$document, $user] = ragWorld();
    geminiAnswers('Selon le document, oui. Source : page 2');
    Sanctum::actingAs($user);

    for ($i = 0; $i < 20; $i++) {
        $this->postJson("/api/documents/{$document->slug}/ask", ['question' => "Question {$i} sur la biodiversité"])->assertOk();
    }

    $this->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Une de trop'])->assertStatus(429);
});

test('un PDF remplacé par un PDF sans texte ne laisse pas les passages de l\'ancien fichier', function () {
    Storage::fake('local');
    Storage::disk('local')->put('documents/scan.pdf', '%PDF');
    $document = Document::factory()->create(['file_path' => 'documents/scan.pdf']);
    $document->chunks()->create(['page_number' => 1, 'chunk_index' => 0, 'content' => 'Ancien contenu', 'embedding' => []]);

    $extractor = Mockery::mock(PdfTextExtractor::class);
    $extractor->shouldReceive('extractPages')->andReturn([]);
    app()->instance(PdfTextExtractor::class, $extractor);

    app(DocumentIngestionService::class)->ingest($document);

    expect($document->chunks()->count())->toBe(0);
});

test('la réindexation remplace les passages une fois les embeddings calculés', function () {
    config(['services.gemini.key' => 'test-key']);
    Storage::fake('local');
    Storage::disk('local')->put('documents/new.pdf', '%PDF');
    $document = Document::factory()->create(['file_path' => 'documents/new.pdf']);
    $document->chunks()->create(['page_number' => 1, 'chunk_index' => 0, 'content' => 'Ancien contenu', 'embedding' => []]);

    $extractor = Mockery::mock(PdfTextExtractor::class);
    $extractor->shouldReceive('extractPages')->andReturn([1 => 'Nouveau contenu du document.']);
    app()->instance(PdfTextExtractor::class, $extractor);
    Http::fake(['*:batchEmbedContents' => Http::response(['embeddings' => [['values' => [0.1, 0.2]]]])]);

    app(DocumentIngestionService::class)->ingest($document);

    expect($document->chunks()->pluck('content')->all())->toBe(['Nouveau contenu du document.'])
        ->and($document->chunks()->first()->embedding)->toBe([0.1, 0.2]);
});

test('assistant de gestion : une longue réponse dans l\'historique ne fait plus échouer la question suivante', function () {
    config(['services.gemini.key' => 'test-key']);
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['role' => 'model', 'parts' => [['functionCall' => ['name' => 'aucune_donnee_necessaire', 'args' => ['motif' => 'salutation']]]]]]]])]);
    Sanctum::actingAs($admin);

    $this->postJson('/api/assistant/admin', [
        'question' => 'Merci !',
        'history' => [
            ['role' => 'model', 'text' => 'Réponse orpheline en tête'],
            ['role' => 'user', 'text' => 'Liste les documents'],
            ['role' => 'model', 'text' => str_repeat('Une très longue réponse. ', 200)],
            ['role' => 'user', 'text' => 'Question restée sans réponse (erreur)'],
        ],
    ])->assertOk();

    // Conversation envoyée à Gemini : commence par l'utilisateur et alterne les rôles.
    Http::assertSent(function (ClientRequest $request) {
        $roles = array_column($request->data()['contents'], 'role');

        return $roles[0] === 'user' && $roles === array_values(array_filter($roles, fn ($r, $i) => $i === 0 || $r !== $roles[$i - 1], ARRAY_FILTER_USE_BOTH));
    });
});
