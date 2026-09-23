<?php

// Paramètres → Modifier la page d'accueil : brouillon, publication, historique, sécurité.

use App\Models\HomepageVersion;
use App\Models\Library;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function homepageAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

function heroSection(array $content = [], array $overrides = []): array
{
    return array_merge([
        'id' => 'hero',
        'type' => 'hero',
        'visible' => true,
        'content' => array_merge(['title' => 'Bienvenue', 'show_search' => true, 'features' => ['Recherche']], $content),
        'style' => [],
    ], $overrides);
}

function textSection(string $id, array $content = []): array
{
    return ['id' => $id, 'type' => 'text', 'visible' => true, 'content' => $content + ['title' => 'Texte'], 'style' => []];
}

beforeEach(function () {
    Storage::fake('public');
});

test('sans version publiée, la page publique reçoit sections = null (contenu par défaut)', function () {
    $this->getJson('/api/homepage')
        ->assertOk()
        ->assertJson(['version' => null, 'sections' => null]);
});

test('un brouillon ne modifie pas la page publique ; la publication la met à jour', function () {
    $admin = homepageAdmin();
    Sanctum::actingAs($admin);

    $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection(), textSection('intro')]])->assertOk();

    $this->getJson('/api/homepage')->assertJson(['sections' => null]);
    $this->getJson('/api/admin/homepage')->assertJsonPath('draft.sections.1.id', 'intro');

    $this->postJson('/api/admin/homepage/publish')->assertOk()->assertJsonPath('published.version', 1);

    $this->getJson('/api/homepage')
        ->assertJsonPath('version', 1)
        ->assertJsonPath('sections.0.content.title', 'Bienvenue')
        ->assertJsonPath('sections.1.id', 'intro');

    // Le brouillon publié est consommé ; l'auteur et la date sont enregistrés.
    expect(HomepageVersion::draft())->toBeNull();
    $version = HomepageVersion::current();
    expect($version->created_by)->toBe($admin->id)->and($version->published_at)->not->toBeNull();
});

test('publier sans brouillon est refusé', function () {
    Sanctum::actingAs(homepageAdmin());

    $this->postJson('/api/admin/homepage/publish')->assertStatus(422);
});

test('l\'ordre et la visibilité sont conservés ; une section masquée garde son contenu', function () {
    Sanctum::actingAs(homepageAdmin());

    $sections = [textSection('b', ['body' => 'Second']), heroSection([], ['visible' => false])];
    $this->putJson('/api/admin/homepage/draft', ['sections' => $sections])->assertOk();
    $this->postJson('/api/admin/homepage/publish')->assertOk();

    $this->getJson('/api/homepage')
        ->assertJsonPath('sections.0.id', 'b')
        ->assertJsonPath('sections.1.id', 'hero')
        ->assertJsonPath('sections.1.visible', false)
        ->assertJsonPath('sections.1.content.title', 'Bienvenue');
});

test('les données invalides sont refusées', function (array $section, string $errorKey) {
    Sanctum::actingAs(homepageAdmin());

    $this->putJson('/api/admin/homepage/draft', ['sections' => [$section]])
        ->assertStatus(422)
        ->assertJsonValidationErrors([$errorKey]);
})->with([
    'type inconnu' => [['id' => 'x', 'type' => 'script', 'visible' => true], 'sections.0.type'],
    'lien javascript:' => [['id' => 'c', 'type' => 'cta', 'visible' => true, 'content' => ['button_link' => 'javascript:alert(1)']], 'sections.0.content.button_link'],
    'lien //hôte' => [['id' => 'c', 'type' => 'cta', 'visible' => true, 'content' => ['button_link' => '//evil.test']], 'sections.0.content.button_link'],
    'couleur non hexadécimale' => [heroSection([], ['style' => ['bg_color' => 'red; background:url(x)']]), 'sections.0.style.bg_color'],
    'taille hors liste' => [heroSection([], ['style' => ['title_size' => '200px']]), 'sections.0.style.title_size'],
    'texte trop long' => [heroSection(['title' => str_repeat('a', 161)]), 'sections.0.content.title'],
    'limite hors bornes' => [['id' => 'd', 'type' => 'documents', 'visible' => true, 'content' => ['limit' => 99]], 'sections.0.content.limit'],
    'image hors dossier homepage' => [heroSection(['image' => '../.env']), 'sections.0.content.image'],
    'identifiant invalide' => [heroSection([], ['id' => '<b>']), 'sections.0.id'],
]);

test('les identifiants de section en double sont refusés', function () {
    Sanctum::actingAs(homepageAdmin());

    $this->putJson('/api/admin/homepage/draft', ['sections' => [textSection('a'), textSection('a')]])
        ->assertStatus(422);
});

test('les champs et styles inconnus sont ignorés, les liens sûrs acceptés', function () {
    Sanctum::actingAs(homepageAdmin());

    $section = [
        'id' => 'cta', 'type' => 'cta', 'visible' => true,
        'content' => ['title' => 'Go', 'button_link' => 'https://univ-mahajanga.mg', 'html' => '<script>x</script>'],
        'style' => ['bg_color' => '#112233', 'css' => 'position:fixed'],
    ];
    $this->putJson('/api/admin/homepage/draft', ['sections' => [$section]])->assertOk();

    $stored = HomepageVersion::draft()->sections()[0];
    expect($stored['content'])->not->toHaveKey('html')
        ->and($stored['content']['button_link'])->toBe('https://univ-mahajanga.mg')
        ->and($stored['style'])->not->toHaveKey('css')
        ->and($stored['style']['bg_color'])->toBe('#112233');
});

test('téléversement d\'image puis utilisation dans une section', function () {
    Sanctum::actingAs(homepageAdmin());

    $path = $this->post('/api/admin/homepage/images', ['image' => UploadedFile::fake()->image('hero.jpg')], ['Accept' => 'application/json'])
        ->assertCreated()
        ->json('path');

    Storage::disk('public')->assertExists($path);
    expect($path)->toStartWith('homepage/');

    $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection(['image' => $path])]])->assertOk();
    expect(HomepageVersion::draft()->sections()[0]['content']['image'])->toBe($path);
});

test('un fichier qui n\'est pas une image est refusé', function () {
    Sanctum::actingAs(homepageAdmin());

    $this->post('/api/admin/homepage/images', ['image' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
        ->assertStatus(422);
});

test('les images orphelines anciennes sont supprimées, celles d\'une version publiée conservées', function () {
    Sanctum::actingAs(homepageAdmin());
    $disk = Storage::disk('public');

    $disk->put('homepage/used.jpg', 'x');
    $disk->put('homepage/orphan.jpg', 'x');
    $disk->put('homepage/recent.jpg', 'x');
    touch($disk->path('homepage/used.jpg'), now()->subDays(2)->getTimestamp());
    touch($disk->path('homepage/orphan.jpg'), now()->subDays(2)->getTimestamp());

    // Version 1 utilise l'image ; le brouillon suivant la remplace.
    $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection(['image' => 'homepage/used.jpg'])]])->assertOk();
    $this->postJson('/api/admin/homepage/publish')->assertOk();
    $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection(['image' => null])]])->assertOk();

    $disk->assertExists('homepage/used.jpg'); // encore utilisée par la version 1 (restauration possible)
    $disk->assertExists('homepage/recent.jpg'); // téléversement récent pas encore enregistré
    $disk->assertMissing('homepage/orphan.jpg');
});

test('historique et restauration : nouvelle version, historique intact', function () {
    Sanctum::actingAs(homepageAdmin());

    foreach (['V1', 'V2'] as $title) {
        $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection(['title' => $title])]])->assertOk();
        $this->postJson('/api/admin/homepage/publish')->assertOk();
    }
    $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection(['title' => 'Brouillon'])]])->assertOk();

    $this->getJson('/api/admin/homepage/versions')
        ->assertJsonPath('total', 2)
        ->assertJsonPath('data.0.version', 2);
    $this->getJson('/api/admin/homepage/versions/1')->assertJsonPath('sections.0.content.title', 'V1');

    $this->postJson('/api/admin/homepage/versions/1/restore')
        ->assertOk()
        ->assertJsonPath('published.version', 3)
        ->assertJsonPath('published.restored_from', 1);

    $this->getJson('/api/homepage')->assertJsonPath('version', 3)->assertJsonPath('sections.0.content.title', 'V1');
    expect(HomepageVersion::published()->count())->toBe(3)
        ->and(HomepageVersion::draft())->toBeNull();

    $this->postJson('/api/admin/homepage/versions/99/restore')->assertNotFound();
});

test('étudiant, enseignant, chercheur et bibliothécaire n\'ont accès à aucune API d\'administration', function (string $role) {
    $attributes = ['role' => $role, 'is_active' => true];
    if ($role === 'bibliothecaire') {
        $attributes['library_id'] = Library::factory()->create()->id;
    }
    Sanctum::actingAs(User::factory()->create($attributes));

    $this->getJson('/api/admin/homepage')->assertForbidden();
    $this->putJson('/api/admin/homepage/draft', ['sections' => [heroSection()]])->assertForbidden();
    $this->deleteJson('/api/admin/homepage/draft')->assertForbidden();
    $this->postJson('/api/admin/homepage/publish')->assertForbidden();
    $this->post('/api/admin/homepage/images', ['image' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])->assertForbidden();
    $this->getJson('/api/admin/homepage/versions')->assertForbidden();
    $this->getJson('/api/admin/homepage/versions/1')->assertForbidden();
    $this->postJson('/api/admin/homepage/versions/1/restore')->assertForbidden();

    expect(HomepageVersion::count())->toBe(0);
})->with(['etudiant', 'enseignant', 'chercheur', 'bibliothecaire']);

test('un visiteur non connecté ne peut pas appeler les API d\'administration', function () {
    $this->getJson('/api/admin/homepage')->assertUnauthorized();
    $this->putJson('/api/admin/homepage/draft', ['sections' => []])->assertUnauthorized();
    $this->postJson('/api/admin/homepage/publish')->assertUnauthorized();
});
