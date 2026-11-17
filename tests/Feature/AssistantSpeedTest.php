<?php

// Temps de réponse des assistants IA : aucune génération en double, réflexion réduite partout.

use App\Models\Document;
use App\Models\DocumentChunk;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

function speedCall(string $name, array $args = []): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['functionCall' => ['name' => $name, 'args' => $args]]]]]]];
}

function speedText(string $text): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['text' => $text]]]]]];
}

function speedAdmin(): User
{
    config(['services.gemini.key' => 'test-key', 'services.gemini.thinking_level' => 'low']);

    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

function speedSse(array ...$events): string
{
    return implode('', array_map(fn ($e) => 'data: ' . json_encode($e) . "\r\n\r\n", $events));
}

test('l\'assistant de gestion en flux ne rédige plus la réponse deux fois', function () {
    $admin = speedAdmin();
    Document::factory()->count(3)->create(['status' => 'brouillon']);

    Http::fake([
        '*:streamGenerateContent*' => Http::response(speedSse(speedText('Il y a '), speedText('3 brouillons.')), 200, ['Content-Type' => 'text/event-stream']),
        '*:generateContent*' => Http::response(speedCall('compter_documents', ['statut' => 'brouillon'])),
    ]);
    Sanctum::actingAs($admin);

    $body = $this->post('/api/assistant/admin/stream', ['question' => 'Combien de brouillons ?'])->assertOk()->streamedContent();

    expect($body)->toContain('3 brouillons.')
        // Un appel pour choisir l'outil, un seul pour écrire la réponse (avant : trois).
        ->and(Http::recorded())->toHaveCount(2)
        ->and(Http::recorded()[1][0]->data()['generationConfig']['thinkingConfig']['thinkingLevel'] ?? null)->toBe('low');
});

test('un outil demandé pendant le flux est exécuté avant la réponse', function () {
    $admin = speedAdmin();
    Document::factory()->count(2)->create(['status' => 'publie']);

    Http::fake([
        '*:streamGenerateContent*' => Http::sequence()
            ->push(speedSse(speedCall('compter_documents', ['statut' => 'publie'])), 200, ['Content-Type' => 'text/event-stream'])
            ->push(speedSse(speedText('2 documents publiés.')), 200, ['Content-Type' => 'text/event-stream']),
        '*:generateContent*' => Http::response(speedCall('compter_documents', ['statut' => 'brouillon'])),
    ]);
    Sanctum::actingAs($admin);

    $body = $this->post('/api/assistant/admin/stream', ['question' => 'Brouillons et publiés ?'])->assertOk()->streamedContent();

    expect($body)->toContain('2 documents publiés.')->and(Http::recorded())->toHaveCount(3);
    // Le second outil a bien reçu sa réponse avant la rédaction finale.
    expect(json_encode(Http::recorded()[2][0]->data()['contents'], JSON_UNESCAPED_UNICODE))->toContain('"statut":"publie"')->toContain('functionResponse');
});

test('l\'assistant des documents demande une réflexion réduite à Gemini', function () {
    config(['services.gemini.key' => 'test-key', 'services.gemini.thinking_level' => 'low']);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'public']);
    DocumentChunk::create(['document_id' => $document->id, 'page_number' => 1, 'chunk_index' => 0, 'content' => str_repeat('La photosynthèse transforme la lumière en énergie chimique. ', 5), 'embedding' => [0.1, 0.2]]);

    Http::fake([
        '*:embedContent*' => Http::response(['embedding' => ['values' => [0.1, 0.2]]]),
        '*:streamGenerateContent*' => Http::response(speedSse(speedText('Selon le document, la photosynthèse… (p. 1)')), 200, ['Content-Type' => 'text/event-stream']),
    ]);
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->post("/api/documents/{$document->slug}/ask-stream", ['question' => 'Que dit le document sur la photosynthèse ?'])->assertOk()->streamedContent();

    $generation = collect(Http::recorded())->first(fn ($r) => str_contains($r[0]->url(), 'streamGenerateContent'));
    expect($generation)->not->toBeNull()
        ->and($generation[0]->data()['generationConfig']['thinkingConfig']['thinkingLevel'] ?? null)->toBe('low');
});
