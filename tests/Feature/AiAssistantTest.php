<?php

use App\Models\AiQuery;
use App\Models\Document;
use App\Models\User;
use App\Services\RagService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Crée un document publié avec quelques chunks (pages 2 et 3) et un
 * utilisateur actif. Gemini est toujours simulé : aucun appel réseau réel.
 */
function aiSetup(array $documentOverrides = []): array
{
    config([
        'services.gemini.key' => 'test-key',
        'services.gemini.model' => 'm-main',
        'services.gemini.fast_model' => null,
        'services.gemini.fallback_models' => ['m-fallback'],
        'services.gemini.image_models' => ['img-1'],
    ]);

    $document = Document::factory()->create(array_merge([
        'status' => 'publie',
        'access_level' => 'authentifie',
        'title' => 'Cours de biodiversité',
    ], $documentOverrides));

    $document->chunks()->create([
        'page_number' => 2, 'chunk_index' => 0,
        'content' => 'La biodiversité désigne la variété du vivant sur Terre.',
        'embedding' => [1.0, 0.0, 0.0],
    ]);
    $document->chunks()->create([
        'page_number' => 3, 'chunk_index' => 1,
        'content' => 'Les écosystèmes marins abritent de nombreuses espèces.',
        'embedding' => [0.9, 0.1, 0.0],
    ]);

    $user = User::factory()->create(['is_active' => true]);

    return [$document, $user];
}

function fakeGemini(string $answer = 'Selon le document, la biodiversité est la variété du vivant. Source : page 2'): void
{
    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => $answer]]]]],
        ]),
    ]);
}

test('la réponse est fondée sur le document avec des pages sources réelles', function () {
    [$document, $user] = aiSetup();
    fakeGemini();

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Que dit le document sur la biodiversité ?']);

    $response->assertOk();
    expect($response->json('answer'))->toContain('Selon le document');
    expect(collect($response->json('sources'))->pluck('page')->unique()->all())->toBe([2]);
    $this->assertDatabaseHas('ai_queries', ['user_id' => $user->id, 'document_id' => $document->id]);
});

test('une fausse page citée par le modèle est supprimée et absente des sources', function () {
    [$document, $user] = aiSetup();
    fakeGemini("Selon le document, c'est défini (p. 2, p. 99).\n\nSource : page 99");

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Définis la biodiversité']);

    $response->assertOk();
    expect($response->json('answer'))->not->toContain('99');
    expect($response->json('answer'))->toContain('p. 2');
    expect(collect($response->json('sources'))->pluck('page')->all())->toBe([2]);
});

test('une information absente du document ne renvoie aucune source', function () {
    [$document, $user] = aiSetup();
    fakeGemini(RagService::NOT_FOUND . ' Le document ne parle pas de cela.');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Quelle est la capitale du Japon ?']);

    $response->assertOk();
    expect($response->json('answer'))->toContain('Je ne trouve pas cette information dans le document consulté.');
    expect($response->json('sources'))->toBe([]);
    expect($response->json('meta.not_found'))->toBeTrue();
});

test('l\'historique et la page ouverte sont transmis au modèle', function () {
    [$document, $user] = aiSetup();
    fakeGemini();

    $this->actingAs($user, 'sanctum')->postJson("/api/documents/{$document->slug}/ask", [
        'question' => 'Explique le premier point',
        'history' => [['question' => 'Résume le chapitre 2', 'answer' => 'Trois points : A, B, C.']],
        'current_page' => 3,
    ])->assertOk();

    Http::assertSent(function ($request) {
        if (!str_contains($request->url(), ':generateContent')) {
            return false;
        }

        $prompt = json_encode($request->data(), JSON_UNESCAPED_UNICODE);

        return str_contains($prompt, 'Trois points : A, B, C.')
            && str_contains($prompt, "PAGE ACTUELLEMENT OUVERTE PAR L'UTILISATEUR : 3");
    });
});

test('le modèle de repli est utilisé quand le modèle principal est surchargé', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*models/m-main:generateContent' => Http::response(['error' => ['message' => 'overloaded']], 503),
        '*models/m-fallback:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => 'Selon le document, ok. Source : page 2']]]]],
        ]),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Définis la biodiversité']);

    $response->assertOk();
    expect($response->json('meta.model'))->toBe('m-fallback');
});

test('un modèle en échec est mis de côté : la question suivante ne le retente pas en premier', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*models/m-main:generateContent' => Http::response(['error' => ['message' => 'overloaded']], 503),
        '*models/m-fallback:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => 'Selon le document, ok. Source : page 2']]]]],
        ]),
    ]);

    foreach (['Définis la biodiversité', 'Que sont les écosystèmes marins ?'] as $question) {
        $this->actingAs($user, 'sanctum')
            ->postJson("/api/documents/{$document->slug}/ask", ['question' => $question])
            ->assertOk();
    }

    $mainCalls = Http::recorded(fn ($request) => str_contains($request->url(), 'models/m-main:generateContent'));

    expect($mainCalls)->toHaveCount(1);
});

test('un délai réseau dépassé bascule sur le modèle suivant', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*models/m-main:generateContent' => fn () => throw new \Illuminate\Http\Client\ConnectionException('cURL error 28: timed out'),
        '*models/m-fallback:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => 'Selon le document, ok. Source : page 2']]]]],
        ]),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Définis la biodiversité']);

    $response->assertOk();
    expect($response->json('meta.model'))->toBe('m-fallback');
});

test('si tous les modèles échouent une erreur claire est renvoyée sans enregistrer de fausse réponse', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:generateContent' => Http::response(['error' => ['message' => 'overloaded']], 503),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Définis la biodiversité']);

    $response->assertStatus(503);
    expect($response->json('message'))->toContain('sollicité');
    expect(AiQuery::count())->toBe(0);
});

test('un résumé bloqué par Gemini (recitation/sécurité) renvoie un message précis, pas une panne générique', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => []], 'finishReason' => 'RECITATION']],
        ]),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Fais-moi un résumé du document']);

    $response->assertStatus(503);
    expect($response->json('message'))->toContain('bloqué');
    expect(AiQuery::count())->toBe(0);
});

test('un résumé simplement vide (STOP, sans blocage) ne bascule pas indéfiniment sur les autres modèles', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => []], 'finishReason' => 'STOP']],
        ]),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Fais-moi un résumé du document']);

    $response->assertStatus(503);
    expect($response->json('message'))->toContain("n'ai pas pu générer");
});

test('un chunk contenant des octets UTF-8 invalides (PDF mal extrait) ne fait pas planter le résumé', function () {
    [$document, $user] = aiSetup();

    // Texte tel qu'un PDF à la police CID corrompue peut le faire ressortir :
    // octets de continuation UTF-8 orphelins, invalides pour json_encode.
    $document->chunks()->create([
        'page_number' => 4, 'chunk_index' => 2,
        'content' => "Texte corrompu \x80\x81 extrait du PDF.",
        'embedding' => [0.5, 0.5, 0.0],
    ]);

    fakeGemini('Selon le document, voici un résumé complet. Source : page 2');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Fais-moi un résumé du document']);

    $response->assertOk();
    expect($response->json('answer'))->toContain('résumé complet');
});

test('une panne de la recherche sémantique n\'est pas présentée comme "absent du document"', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response('down', 503),
        '*:generateContent' => Http::response(['candidates' => [['content' => ['parts' => [['text' => 'x']]]]]]),
    ]);

    // Aucun mot-clé en commun avec les chunks : seul l'embedding pouvait aider.
    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Quels sont les objectifs poursuivis ?']);

    $response->assertStatus(503);
    expect($response->json('message'))->not->toContain('Je ne trouve pas cette information');
    expect(AiQuery::count())->toBe(0);
});

test('une question sur une figure d\'une page précise est analysée et non recopiée', function () {
    Storage::fake('local');
    [$document, $user] = aiSetup(['file_path' => 'documents/demo.pdf']);
    Storage::disk('local')->put('documents/demo.pdf', '%PDF-1.4 fake');
    fakeGemini('Selon le document, la figure montre un cycle. Source : page 2');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Que montre la figure de la page 2 ?']);

    $response->assertOk();
    expect($response->json('answer'))->not->toContain('Contenu disponible');
    expect($response->json('meta.visual'))->toBeTrue();
});

test('une question visuelle joint réellement le PDF au modèle', function () {
    Storage::fake('local');
    [$document, $user] = aiSetup(['file_path' => 'documents/demo.pdf']);
    Storage::disk('local')->put('documents/demo.pdf', '%PDF-1.4 fake');
    fakeGemini('Selon le document, le graphique montre une hausse. Source : page 3');

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Que montre ce graphique ?', 'current_page' => 3]);

    $response->assertOk();
    expect($response->json('meta.visual'))->toBeTrue();

    Http::assertSent(fn ($request) => str_contains($request->url(), ':generateContent')
        && str_contains(json_encode($request->data()), 'application\/pdf'));
});

test('sans PDF disponible le modèle est prévenu qu\'aucun élément visuel n\'est fourni', function () {
    // Fichier référencé mais absent du disque.
    Storage::fake('local');
    [$document, $user] = aiSetup(['file_path' => 'documents/absent.pdf']);
    fakeGemini();

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Que montre ce graphique ?']);

    $response->assertOk();
    expect($response->json('meta.visual'))->toBeFalse();

    Http::assertSent(fn ($request) => str_contains($request->url(), ':generateContent')
        && str_contains(json_encode($request->data(), JSON_UNESCAPED_UNICODE), "AUCUN élément visuel n'a pu être fourni"));
});

test('une demande d\'image génère une image sans la stocker en base', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*models/img-1:generateContent' => Http::response([
            'candidates' => [['content' => ['parts' => [
                ['text' => 'Voici le schéma.'],
                ['inlineData' => ['mimeType' => 'image/png', 'data' => 'QUJD']],
            ]]]],
        ]),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Crée-moi une illustration du cycle de la biodiversité']);

    $response->assertOk();
    expect($response->json('image.mime'))->toBe('image/png');
    expect($response->json('image.data'))->toBe('QUJD');
    expect($response->json('answer'))->toContain('pas un extrait du document');

    $stored = AiQuery::first();
    expect(json_encode($stored->toArray()))->not->toContain('QUJD');
});

test('quand la génération d\'image est refusée par quota une erreur claire est renvoyée', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*models/img-1:generateContent' => Http::response(['error' => ['message' => 'quota']], 429),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Dessine un schéma pédagogique de ce concept']);

    $response->assertStatus(429);
    expect($response->json('message'))->toContain('images');
});

test('le flux SSE envoie les fragments puis la réponse finale validée', function () {
    [$document, $user] = aiSetup();

    $sse = "data: " . json_encode(['candidates' => [['content' => ['parts' => [['text' => 'Selon le document, ']]]]]]) . "\r\n\r\n"
        . "data: " . json_encode(['candidates' => [['content' => ['parts' => [['text' => 'la vie (p. 2, p. 77). Source : page 2']]]]]]) . "\r\n\r\n";

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:streamGenerateContent*' => Http::response($sse, 200, ['Content-Type' => 'text/event-stream']),
    ]);

    $response = $this->actingAs($user, 'sanctum')
        ->post("/api/documents/{$document->slug}/ask-stream", ['question' => 'Définis la biodiversité'], ['Accept' => 'text/event-stream']);

    $response->assertOk();
    $body = $response->streamedContent();

    expect($body)->toContain('event: delta');
    expect($body)->toContain('event: done');
    expect($body)->not->toContain('77');
    $this->assertDatabaseCount('ai_queries', 1);
});

test('le flux SSE renvoie un événement d\'erreur si Gemini est indisponible', function () {
    [$document, $user] = aiSetup();

    Http::fake([
        '*:embedContent' => Http::response(['embedding' => ['values' => [1.0, 0.0, 0.0]]]),
        '*:streamGenerateContent*' => Http::response('overloaded', 503),
    ]);

    $body = $this->actingAs($user, 'sanctum')
        ->post("/api/documents/{$document->slug}/ask-stream", ['question' => 'Définis la biodiversité'])
        ->streamedContent();

    expect($body)->toContain('event: error');
    expect($body)->not->toContain('event: done');
    $this->assertDatabaseCount('ai_queries', 0);
});

test('l\'assistant reste protégé : visiteur refusé, document restreint refusé', function () {
    [$document] = aiSetup();

    $this->postJson("/api/documents/{$document->slug}/ask", ['question' => 'Salut'])->assertStatus(401);
    $this->postJson("/api/documents/{$document->slug}/ask-stream", ['question' => 'Salut'])->assertStatus(401);

    $restricted = Document::factory()->create(['status' => 'publie', 'access_level' => 'restreint']);
    $outsider = User::factory()->create(['is_active' => true]);

    $this->actingAs($outsider, 'sanctum')
        ->postJson("/api/documents/{$restricted->slug}/ask", ['question' => 'Salut'])
        ->assertStatus(403);
});

test('détection des demandes d\'image et des questions visuelles', function () {
    $rag = app(RagService::class);

    foreach ([
        'Crée-moi une illustration qui explique le cycle de l\'eau.',
        'Crée un schéma pédagogique de ce concept.',
        'Fais une image résumant les étapes présentées.',
        'Montre-moi un schéma qui explique ce concept.',
        'Dessine un diagramme des étapes',
    ] as $q) {
        expect($rag->isImageRequest($q))->toBeTrue($q);
    }

    foreach ([
        'Que représente cette image ?',
        'Explique ce graphique.',
        'Résume le chapitre 2',
        'Que montre le schéma de la page 4 ?',
        'À quelle page trouve-t-on la définition ?',
    ] as $q) {
        expect($rag->isImageRequest($q))->toBeFalse($q);
    }

    foreach (['Que montre ce tableau ?', 'Explique cette formule', 'Que représente cette figure ?'] as $q) {
        expect($rag->isVisualQuestion($q))->toBeTrue($q);
    }

    expect($rag->isVisualQuestion('Quelles sont les conclusions ?'))->toBeFalse();
});

test('les citations de pages hors contexte sont nettoyées sans casser les valides', function () {
    $rag = app(RagService::class);

    [$text, $cited] = $rag->sanitizeCitations("Vrai (p. 4). Faux (p. 50).\n\nSource : pages 4, 50 et 6", [4, 6]);

    expect($cited)->toBe([4, 6]);
    expect($text)->not->toContain('50');
    expect($text)->toContain('p. 4');
});
