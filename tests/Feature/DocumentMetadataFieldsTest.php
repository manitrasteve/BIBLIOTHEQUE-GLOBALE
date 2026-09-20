<?php

use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function metadataUser(string $role): User
{
    return User::factory()->create([
        'role' => $role,
        'is_active' => true,
        'library_id' => Library::factory()->create()->id,
    ]);
}

function metadataPayload(array $overrides = []): array
{
    return array_merge([
        'title' => 'Introduction à l’algorithmique',
        'type' => 'Livre numérique',
        'category' => 'Sciences informatiques',
        // La bibliothèque du compte connecté (un bibliothécaire ne crée que dans la sienne).
        'library_id' => auth()->user()?->library_id ?? Library::factory()->create()->id,
        'language' => 'Français',
        'access_level' => 'authentifie',
        'file' => UploadedFile::fake()->create('cours.pdf', 100, 'application/pdf'),
    ], $overrides);
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake(); // aucune indexation IA réelle
});

test('création avec type, catégorie et langue libres ; niveau, ISBN et éditeur vides', function (string $role) {
    Sanctum::actingAs(metadataUser($role));

    $response = $this->post('/api/documents', metadataPayload(['niveau' => '', 'isbn' => '', 'publisher' => '']), ['Accept' => 'application/json'])
        ->assertCreated();

    $document = Document::findOrFail($response->json('id'));
    expect($document->type)->toBe('Livre numérique')
        ->and($document->language)->toBe('Français')
        ->and($document->niveau)->toBeNull()
        ->and($document->isbn)->toBeNull()
        ->and($document->publisher)->toBeNull()
        ->and($document->category->name)->toBe('Sciences informatiques')
        ->and($document->status)->toBe('brouillon');
})->with(['administrateur', 'bibliothecaire']);

test('niveau, ISBN et éditeur remplis sont enregistrés tels quels, accents et plusieurs mots compris', function () {
    Sanctum::actingAs(metadataUser('bibliothecaire'));

    $id = $this->post('/api/documents', metadataPayload([
        'type' => 'Mémoire de fin d’études',
        'niveau' => 'Licence 2 (L2)',
        'category' => 'Éthique & société numérique',
        'language' => 'Malgache — dialecte betsimisaraka',
        'isbn' => '978-2-1234-5678-9',
        'publisher' => 'Éditions de l’Université',
    ]), ['Accept' => 'application/json'])->assertCreated()->json('id');

    $document = Document::with('category')->findOrFail($id);
    expect($document->type)->toBe('Mémoire de fin d’études')
        ->and($document->niveau)->toBe('Licence 2 (L2)')
        ->and($document->category->name)->toBe('Éthique & société numérique')
        ->and($document->language)->toBe('Malgache — dialecte betsimisaraka')
        ->and($document->isbn)->toBe('978-2-1234-5678-9')
        ->and($document->publisher)->toBe('Éditions de l’Université');
});

test('une catégorie déjà existante est réutilisée (casse, espaces et accents ignorés)', function () {
    Sanctum::actingAs(metadataUser('administrateur'));
    $existing = Category::factory()->create(['name' => 'Droit public']);

    foreach (['droit public', '  DROIT   PUBLIC ', 'Droit  Public'] as $name) {
        $id = $this->post('/api/documents', metadataPayload(['category' => $name]), ['Accept' => 'application/json'])->assertCreated()->json('id');
        expect(Document::findOrFail($id)->category_id)->toBe($existing->id);
    }
    expect(Category::where('name', 'like', '%roit%ublic%')->count())->toBe(1);

    // Une nouvelle catégorie est créée une seule fois.
    $this->post('/api/documents', metadataPayload(['category' => 'Géologie marine']), ['Accept' => 'application/json'])->assertCreated();
    $this->post('/api/documents', metadataPayload(['category' => 'géologie marine']), ['Accept' => 'application/json'])->assertCreated();
    expect(Category::where('name', 'Géologie marine')->count())->toBe(1);
});

test('type, catégorie, langue et titre restent obligatoires ; niveau, ISBN et éditeur facultatifs', function () {
    Sanctum::actingAs(metadataUser('bibliothecaire'));

    foreach (['title', 'type', 'category', 'language'] as $field) {
        $payload = metadataPayload([$field => '']);
        $this->post('/api/documents', $payload, ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors([$field === 'category' ? 'category' : $field]);
    }
    $this->post('/api/documents', metadataPayload(['category' => '???']), ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('category');
    $this->post('/api/documents', metadataPayload(['file' => null]), ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('file');

    $this->post('/api/documents', metadataPayload(), ['Accept' => 'application/json'])->assertCreated();
});

test('l\'ancien envoi par category_id reste accepté', function () {
    Sanctum::actingAs(metadataUser('administrateur'));
    $category = Category::factory()->create();

    $id = $this->post('/api/documents', metadataPayload(['category' => null, 'category_id' => $category->id]), ['Accept' => 'application/json'])->assertCreated()->json('id');

    expect(Document::findOrFail($id)->category_id)->toBe($category->id);
});

test('modification : les valeurs existantes se changent librement, y compris le type, et le niveau peut être vidé', function () {
    $librarian = metadataUser('bibliothecaire');
    Sanctum::actingAs($librarian);
    $document = Document::factory()->create(['library_id' => $librarian->library_id, 'type' => 'livre', 'niveau' => 'L2', 'language' => 'fr', 'isbn' => '123', 'publisher' => 'Ancien']);

    $this->post("/api/documents/{$document->id}", [
        'type' => 'Rapport de stage',
        'niveau' => '',
        'category' => 'Informatique de gestion',
        'language' => 'Anglais',
        'isbn' => '',
        'publisher' => 'Nouvel éditeur',
    ], ['Accept' => 'application/json'])->assertOk();

    $fresh = $document->fresh()->load('category');
    expect($fresh->type)->toBe('Rapport de stage')
        ->and($fresh->niveau)->toBeNull()
        ->and($fresh->category->name)->toBe('Informatique de gestion')
        ->and($fresh->language)->toBe('Anglais')
        ->and($fresh->isbn)->toBeNull()
        ->and($fresh->publisher)->toBe('Nouvel éditeur');

    // Les champs obligatoires ne peuvent pas être vidés.
    foreach (['type', 'language', 'category', 'title'] as $field) {
        $this->post("/api/documents/{$document->id}", [$field => ''], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors($field);
    }
});

test('la fiche de modification expose les valeurs à afficher dans les champs texte', function () {
    Sanctum::actingAs(metadataUser('administrateur'));
    $category = Category::factory()->create(['name' => 'Informatique']);
    $document = Document::factory()->create(['type' => 'Livre', 'niveau' => 'L2', 'language' => 'Français', 'category_id' => $category->id]);

    $this->getJson("/api/documents-manage/{$document->id}")->assertOk()
        ->assertJsonPath('type', 'Livre')->assertJsonPath('niveau', 'L2')
        ->assertJsonPath('language', 'Français')->assertJsonPath('category.name', 'Informatique');
});

test('les filtres du catalogue retrouvent aussi bien les anciens codes que les valeurs saisies', function () {
    Document::factory()->create(['title' => 'Ancien code', 'status' => 'publie', 'type' => 'memoire', 'language' => 'fr']);
    Document::factory()->create(['title' => 'Libellé saisi', 'status' => 'publie', 'type' => 'Mémoire', 'language' => 'Français']);
    Document::factory()->create(['title' => 'Autre', 'status' => 'publie', 'type' => 'Rapport de stage', 'language' => 'Anglais']);

    $titles = fn (string $query) => collect($this->getJson("/api/documents?{$query}")->assertOk()->json('data'))->pluck('title')->sort()->values()->all();

    expect($titles('type=memoire'))->toBe(['Ancien code', 'Libellé saisi']);
    expect($titles('language=fr'))->toBe(['Ancien code', 'Libellé saisi']);
    expect($titles('language=en'))->toBe(['Autre']);   // « en » retrouve « Anglais »
    expect($titles('language=ru'))->toBe([]);
    expect($titles('type=Rapport de stage'))->toBe(['Autre']);
});
