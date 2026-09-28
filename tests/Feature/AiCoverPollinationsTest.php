<?php

use App\Jobs\GenerateAiCoverJob;
use App\Models\Library;
use App\Models\User;
use App\Services\Covers\FallbackCoverRenderer;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function pollinationsLibrarian(): User
{
    return User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
        'library_id' => Library::factory()->create()->id,
    ]);
}

function pollinationsJpeg(): string
{
    $img = imagecreatetruecolor(3, 4);
    ob_start();
    imagejpeg($img);

    return (string) ob_get_clean();
}

const POLLINATIONS_SCENE = 'Aerial view of flooded rice paddies beside cracked dry fields under a storm cloud';

function pollinationsScene(string $scene = POLLINATIONS_SCENE)
{
    return Http::response(['choices' => [['message' => ['content' => "\"{$scene}\""]]]]);
}

// Prompt d'image envoyé (dernier segment du chemin de l'URL).
function sentImagePrompt(HttpRequest $r): string
{
    return rawurldecode(explode('/prompt/', parse_url($r->url(), PHP_URL_PATH))[1] ?? '');
}

beforeEach(function () {
    Storage::fake('local');
    config([
        'services.pollinations.base_url' => 'https://image.pollinations.ai',
        'services.pollinations.text_url' => 'https://text.pollinations.ai',
        'services.pollinations.model' => null,
        'services.pollinations.token' => null,
        'services.pollinations.retry_delay' => 0,
    ]);
});

test("le document est décrit en scène visuelle, puis cette scène est dessinée", function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response(pollinationsJpeg(), 200, ['Content-Type' => 'image/jpeg']),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    // File « sync » en test : la tâche s'exécute pendant la requête de lancement.
    $id = $this->postJson('/api/ai-covers', [
        'title' => 'Impact du changement climatique sur la riziculture',
        'subtitle' => 'Région Alaotra-Mangoro',
        'abstract' => '<p>Étude des <strong>rendements</strong></p>',
    ])->assertStatus(202)->json('request_id');

    $this->getJson("/api/ai-covers/{$id}")
        ->assertOk()
        ->assertJson(['status' => 'completed', 'source' => 'ai', 'mime' => 'image/jpeg']);

    // Le titre, le sous-titre et le résumé (sans HTML) sont transmis au service de texte.
    Http::assertSent(function (HttpRequest $r) {
        $document = $r['messages'][1]['content'] ?? '';

        return $r->url() === 'https://text.pollinations.ai/openai'
            && str_contains($document, 'Impact du changement climatique sur la riziculture')
            && str_contains($document, 'Région Alaotra-Mangoro')
            && str_contains($document, 'Étude des rendements')
            && !str_contains($document, '<strong>');
    });
    // Le prompt d'image commence par la scène (sans guillemets) et reste court.
    Http::assertSent(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://image.pollinations.ai/prompt/')
        && str_contains($r->url(), 'width=768') && str_contains($r->url(), 'height=1024')
        && str_starts_with(sentImagePrompt($r), POLLINATIONS_SCENE . '.')
        && mb_strlen(sentImagePrompt($r)) < 250);
});

test('le style saisi est ajouté au prompt d\'image', function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response(pollinationsJpeg(), 200),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $this->postJson('/api/ai-covers', ['title' => 'Titre', 'instructions' => 'aquarelle'])->assertStatus(202);

    Http::assertSent(fn (HttpRequest $r) => str_contains(sentImagePrompt($r), 'Style: aquarelle.'));
});

test('sans description de scène, le titre et le sous-titre sont placés en tête du prompt', function () {
    Http::fake([
        'text.pollinations.ai/*' => Http::response('down', 503),
        'image.pollinations.ai/*' => Http::response(pollinationsJpeg(), 200),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Droit foncier', 'subtitle' => 'Titres coutumiers'])->json('request_id');

    $this->getJson("/api/ai-covers/{$id}")->assertJson(['status' => 'completed', 'source' => 'ai']);
    Http::assertSent(fn (HttpRequest $r) => str_starts_with(sentImagePrompt($r), 'Droit foncier. Titres coutumiers.'));
});

test('si le service est saturé, la génération est réessayée', function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::sequence()
            ->push(['error' => 'Too Many Requests', 'message' => 'Queue full for IP'], 429)
            ->push(pollinationsJpeg(), 200),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->json('request_id');

    $this->getJson("/api/ai-covers/{$id}")->assertJson(['status' => 'completed', 'source' => 'ai']);
    Http::assertSentCount(3); // texte + 2 essais d'image
});

test('un service durablement saturé mène à la couverture de secours, sans boucle infinie', function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response(['error' => 'Too Many Requests'], 429),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->json('request_id');

    $this->getJson("/api/ai-covers/{$id}")->assertJson(['status' => 'completed', 'source' => 'fallback']);
    Http::assertSentCount(6); // texte + 5 essais d'image
});

test("avec un jeton, l'API authentifiée de Pollinations est utilisée", function () {
    config(['services.pollinations.token' => 'sk_test', 'services.pollinations.gen_url' => 'https://gen.pollinations.ai']);
    Http::fake([
        'gen.pollinations.ai/v1/*' => pollinationsScene(),
        'gen.pollinations.ai/image/*' => Http::response(pollinationsJpeg(), 200),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->json('request_id');

    $this->getJson("/api/ai-covers/{$id}")->assertJson(['status' => 'completed', 'source' => 'ai']);
    Http::assertSent(fn (HttpRequest $r) => $r->url() === 'https://gen.pollinations.ai/v1/chat/completions'
        && $r->header('Authorization')[0] === 'Bearer sk_test');
    Http::assertSent(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://gen.pollinations.ai/image/')
        && $r->header('Authorization')[0] === 'Bearer sk_test');
});

test('si Pollinations échoue, une couverture dessinée par le serveur est proposée', function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response('Service unavailable', 503),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Droit foncier', 'category' => 'Droit', 'type' => 'Mémoire'])
        ->assertStatus(202)->json('request_id');

    $res = $this->getJson("/api/ai-covers/{$id}")->assertOk()->assertJson(['status' => 'completed', 'source' => 'fallback', 'mime' => 'image/jpeg']);

    $bytes = base64_decode(explode(',', $res->json('image'))[1]);
    expect(getimagesizefromstring($bytes))->toMatchArray([0 => 768, 1 => 1024]);
});

test("une page d'erreur renvoyée avec un statut 200 déclenche aussi le secours", function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response('<html>Service error</html>', 200, ['Content-Type' => 'text/html']),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->json('request_id');

    $this->getJson("/api/ai-covers/{$id}")->assertJson(['status' => 'completed', 'source' => 'fallback']);
});

test('la génération passe par la file dédiée aux couvertures', function () {
    Queue::fake();
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->assertStatus(202)->json('request_id');

    Queue::assertPushedOn('covers', GenerateAiCoverJob::class);
    // Tant que la tâche n'a pas tourné, l'état reste « en attente ».
    $this->getJson("/api/ai-covers/{$id}")->assertOk()->assertJson(['status' => 'queued']);
});

test("un autre utilisateur ne peut pas consulter la couverture", function () {
    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response(pollinationsJpeg(), 200),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());
    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->json('request_id');

    Sanctum::actingAs(pollinationsLibrarian());
    $this->getJson("/api/ai-covers/{$id}")->assertNotFound();
});

test('un lecteur ne peut pas générer de couverture', function () {
    Queue::fake();
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->postJson('/api/ai-covers', ['title' => 'Titre'])->assertForbidden();
    Queue::assertNothingPushed();
});

test('le titre est obligatoire', function () {
    Queue::fake();
    Sanctum::actingAs(pollinationsLibrarian());

    $this->postJson('/api/ai-covers', ['title' => ''])->assertStatus(422)->assertJsonValidationErrors('title');
    Queue::assertNothingPushed();
});

test("une image de plus de 1 Mo est gardée sur le disque privé, pas dans le cache", function () {
    // Bruit aléatoire : PNG quasi incompressible (> 1 Mo), comme max_allowed_packet par défaut de MySQL.
    $img = imagecreatetruecolor(700, 700);
    for ($x = 0; $x < 700; $x++) {
        for ($y = 0; $y < 700; $y++) {
            imagesetpixel($img, $x, $y, random_int(0, 0xFFFFFF));
        }
    }
    ob_start();
    imagepng($img);
    $png = (string) ob_get_clean();
    expect(strlen($png))->toBeGreaterThan(1024 * 1024);

    Http::fake([
        'text.pollinations.ai/*' => pollinationsScene(),
        'image.pollinations.ai/*' => Http::response($png, 200, ['Content-Type' => 'image/png']),
    ]);
    Sanctum::actingAs(pollinationsLibrarian());

    $id = $this->postJson('/api/ai-covers', ['title' => 'Titre'])->json('request_id');

    Storage::disk('local')->assertExists(GenerateAiCoverJob::imagePath($id));
    expect(Cache::get(GenerateAiCoverJob::stateKey($id)))->not->toHaveKey('image');

    $res = $this->getJson("/api/ai-covers/{$id}")->assertJson(['status' => 'completed', 'source' => 'ai', 'mime' => 'image/png']);
    expect(base64_decode(explode(',', $res->json('image'))[1]))->toBe($png);
});

test('les images de génération de plus de 2 heures sont supprimées', function () {
    Storage::disk('local')->put('ai-covers/ancienne', 'x');
    Storage::disk('local')->put('ai-covers/recente', 'x');
    touch(Storage::disk('local')->path('ai-covers/ancienne'), time() - 3 * 3600);

    GenerateAiCoverJob::pruneOldImages();

    Storage::disk('local')->assertMissing('ai-covers/ancienne');
    Storage::disk('local')->assertExists('ai-covers/recente');
});

test('la couverture de secours gère les titres longs et accentués', function () {
    $image = (new FallbackCoverRenderer)->render(
        str_repeat('Étude comparée des systèmes éducatifs à Madagascar ', 6),
        'Sous-titre très long pour vérifier le retour à la ligne automatique',
        'Lettres et sciences humaines',
        'Thèse',
    );

    expect($image['mime'])->toBe('image/jpeg')
        ->and(getimagesizefromstring($image['data']))->toMatchArray([0 => 768, 1 => 1024]);
});
