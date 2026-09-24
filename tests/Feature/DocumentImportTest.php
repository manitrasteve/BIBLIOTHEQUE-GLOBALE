<?php

use App\Http\Controllers\Api\DocumentController;
use App\Models\Author;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use App\Services\DocumentImportService;
use App\Support\SimpleXlsx;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

const IMPORT_HEADER = ['Titre *', 'Auteur(s)', 'Type *', 'Niveau', 'Catégorie *', 'Bibliothèque *', 'Année', 'ISBN', 'Langue *', 'Nom du fichier PDF *', 'Nom de la couverture'];

function importStaff(string $role = 'bibliothecaire'): User
{
    $user = User::factory()->create(['role' => $role, 'is_active' => true]);
    Sanctum::actingAs($user);

    return $user;
}

/** Fichier .xlsx de test : en-tête du modèle + lignes données. */
function importExcel(array $rows, ?array $header = null): UploadedFile
{
    return UploadedFile::fake()->createWithContent('lot.xlsx', SimpleXlsx::build([
        ['name' => 'Documents', 'header' => true, 'rows' => [$header ?? IMPORT_HEADER, ...$rows]],
    ]));
}

function importRow(array $overrides = []): array
{
    $row = array_merge([
        'title' => 'Laravel avancé', 'authors' => 'Steve', 'type' => 'Livre', 'niveau' => 'M2',
        'category' => 'Informatique', 'library' => 'Bibliothèque Centrale', 'year' => '2024',
        'isbn' => '', 'language' => 'Français', 'pdf' => 'laravel.pdf', 'cover' => 'laravel.jpg',
    ], $overrides);

    return array_values($row);
}

function analyzeImport(array $rows, array $pdfs = ['laravel.pdf'], array $covers = ['laravel.jpg'], ?array $header = null)
{
    return test()->post('/api/document-imports/analyze', [
        'excel' => importExcel($rows, $header),
        'pdfs' => array_map(fn ($name) => ['name' => $name, 'size' => 1000, 'valid' => true], $pdfs),
        'covers' => array_map(fn ($name) => ['name' => $name, 'size' => 1000, 'valid' => true], $covers),
    ], ['Accept' => 'application/json']);
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();
    Library::factory()->create(['name' => 'Bibliothèque Centrale']);
});

it('génère un vrai modèle .xlsx dont les colonnes suivent le formulaire', function () {
    importStaff();

    $response = $this->get('/api/document-imports/template')->assertOk();
    expect($response->headers->get('content-type'))->toContain('spreadsheetml');

    $path = tempnam(sys_get_temp_dir(), 'tpl');
    file_put_contents($path, $response->getContent());
    $sheet = SimpleXlsx::readFirstSheet($path);
    unlink($path);

    expect($sheet[1])->toContain('Titre *', 'Nom du fichier PDF *', 'Nom de la couverture', 'Bibliothèque *')
        ->and($sheet[2])->toContain('Bibliothèque Centrale'); // exemple = bibliothèque réelle
});

it('couvre chaque champ du formulaire de création dans le modèle Excel', function () {
    // Champs de creationRules absents du formulaire (édition, mots-clés) ou remplacés par une colonne dédiée.
    $notInForm = ['edition', 'keywords', 'category_id', 'author_ids', 'author_ids.*', 'file', 'cover', 'library_id'];
    $columns = array_column(DocumentImportService::columns(), 'key');

    foreach (array_diff(array_keys(DocumentController::creationRules()), $notInForm) as $field) {
        expect($columns)->toContain($field);
    }
    expect($columns)->toContain('library', 'authors', 'pdf', 'cover');
});

it('refuse l\'importation aux utilisateurs non autorisés', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));

    $this->get('/api/document-imports/template')->assertForbidden();
    analyzeImport([importRow()])->assertForbidden();
});

it('refuse un fichier CSV', function () {
    importStaff();

    $this->post('/api/document-imports/analyze', [
        'excel' => UploadedFile::fake()->createWithContent('lot.csv', "Titre\nA"),
    ], ['Accept' => 'application/json'])->assertStatus(422);
});

it('signale les colonnes obligatoires absentes', function () {
    importStaff();

    analyzeImport([['Titre seul']], header: ['Titre *'])
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'Nom du fichier PDF'));
});

it('prépare un document valide (import d\'un seul document) sans rien créer', function () {
    importStaff('administrateur');
    $steve = Author::factory()->create(['name' => 'Steve']);

    $response = analyzeImport([importRow()])->assertOk();

    $response->assertJsonPath('summary.valid', 1)
        ->assertJsonPath('summary.covers_found', 1)
        ->assertJsonPath('rows.0.status', 'valid')
        ->assertJsonPath('rows.0.form.title', 'Laravel avancé')
        ->assertJsonPath('rows.0.form.library_id', Library::where('name', 'Bibliothèque Centrale')->value('id'))
        ->assertJsonPath('rows.0.form.author_ids', [$steve->id])
        ->assertJsonPath('rows.0.form.access_level', 'authentifie')
        ->assertJsonPath('rows.0.matched_pdf', 'laravel.pdf');

    expect(Document::count())->toBe(0);
});

it('associe les fichiers par nom et non par ordre de sélection', function () {
    importStaff();

    $response = analyzeImport(
        [importRow(['title' => 'A', 'pdf' => 'a.pdf', 'cover' => '']), importRow(['title' => 'B', 'pdf' => 'b.pdf', 'cover' => ''])],
        pdfs: ['b.pdf', 'z.pdf', 'a.pdf'],
        covers: [],
    )->assertOk();

    $response->assertJsonPath('rows.0.matched_pdf', 'a.pdf')->assertJsonPath('rows.1.matched_pdf', 'b.pdf');
});

it('gère un lot de plusieurs documents avec erreurs partielles', function () {
    importStaff();

    $rows = [];
    for ($i = 1; $i <= 100; $i++) {
        $rows[] = importRow(['title' => "Document {$i}", 'pdf' => "doc{$i}.pdf", 'cover' => '']);
    }
    $rows[] = importRow(['title' => '', 'pdf' => 'doc1.pdf', 'cover' => '']);      // titre manquant
    $rows[] = importRow(['title' => 'Sans PDF', 'pdf' => 'absent.pdf', 'cover' => '']); // PDF manquant

    $pdfs = array_map(fn ($i) => "doc{$i}.pdf", range(1, 100));
    $response = analyzeImport($rows, pdfs: $pdfs, covers: [])->assertOk();

    $response->assertJsonPath('summary.total', 102)
        ->assertJsonPath('summary.valid', 100)
        ->assertJsonPath('summary.errors', 2)
        ->assertJsonPath('summary.without_cover', 102);
});

it('signale un PDF manquant ou non indiqué', function () {
    importStaff();

    $response = analyzeImport([importRow(['pdf' => 'absent.pdf']), importRow(['title' => 'X', 'pdf' => ''])])->assertOk();

    $response->assertJsonPath('rows.0.status', 'error')
        ->assertJsonPath('rows.0.errors', fn ($e) => str_contains(implode(' ', $e), 'PDF introuvable'))
        ->assertJsonPath('rows.1.errors', fn ($e) => str_contains(implode(' ', $e), 'PDF est obligatoire'));
});

it('accepte un document sans couverture mais refuse une couverture introuvable', function () {
    importStaff();

    $response = analyzeImport([importRow(['cover' => '']), importRow(['title' => 'Autre', 'cover' => 'absente.jpg'])])->assertOk();

    $response->assertJsonPath('rows.0.status', 'valid')
        ->assertJsonPath('rows.1.status', 'error')
        ->assertJsonPath('rows.1.errors', fn ($e) => str_contains(implode(' ', $e), 'Couverture introuvable'));
});

it('signale un fichier dont la signature n\'est pas valide', function () {
    importStaff();

    $this->post('/api/document-imports/analyze', [
        'excel' => importExcel([importRow(['cover' => ''])]),
        'pdfs' => [['name' => 'laravel.pdf', 'size' => 1000, 'valid' => false]],
    ], ['Accept' => 'application/json'])
        ->assertOk()
        ->assertJsonPath('rows.0.errors', fn ($e) => str_contains(implode(' ', $e), "n'est pas un fichier PDF valide"));
});

it('valide les valeurs comme le formulaire', function (array $override, string $expected) {
    importStaff();

    analyzeImport([importRow($override)])->assertOk()
        ->assertJsonPath('rows.0.status', 'error')
        ->assertJsonPath('rows.0.errors', fn ($e) => str_contains(implode(' ', $e), $expected));
})->with([
    'titre manquant' => [['title' => ''], '« Titre » est obligatoire'],
    'bibliothèque inexistante' => [['library' => 'Bibliothèque Fantôme'], 'Bibliothèque inconnue'],
    'type manquant' => [['type' => ''], '« Type » est obligatoire'],
    'type trop long' => [['type' => str_repeat('x', 101)], '« Type » ne doit pas dépasser 100'],
    'niveau invalide' => [['niveau' => 'L9'], 'Niveau invalide'],
    'catégorie invalide' => [['category' => '???'], '« Catégorie » doit contenir au moins une lettre'],
    'catégorie manquante' => [['category' => ''], '« Catégorie » est obligatoire'],
    'année invalide' => [['year' => '24'], '« Année » doit contenir 4 chiffres'],
    'langue manquante' => [['language' => ''], '« Langue » est obligatoire'],
]);

it('ne crée jamais de bibliothèque inconnue', function () {
    importStaff();

    analyzeImport([importRow(['library' => 'Nouvelle bibliothèque'])])->assertOk();

    expect(Library::where('name', 'Nouvelle bibliothèque')->exists())->toBeFalse();
});

it('détecte un doublon ISBN avec la base', function () {
    importStaff();
    Document::factory()->create(['title' => 'Ancien titre', 'isbn' => '978-2-10-000000-0']);

    analyzeImport([importRow(['isbn' => '9782100000000'])])->assertOk()
        ->assertJsonPath('rows.0.status', 'duplicate')
        ->assertJsonPath('rows.0.duplicate.source', 'base')
        ->assertJsonPath('rows.0.duplicate.match', 'isbn')
        ->assertJsonPath('summary.duplicates', 1);
});

it('détecte un doublon titre + auteur avec la base', function () {
    importStaff();
    $doc = Document::factory()->create(['title' => 'Laravel avancé', 'isbn' => null]);
    $doc->authors()->attach(Author::factory()->create(['name' => 'Steve']));

    analyzeImport([importRow()])->assertOk()
        ->assertJsonPath('rows.0.status', 'duplicate')
        ->assertJsonPath('rows.0.duplicate.match', 'titre_auteur');
});

it('détecte un doublon à l\'intérieur du fichier Excel', function () {
    importStaff();

    analyzeImport([importRow(['cover' => '']), importRow(['cover' => ''])])->assertOk()
        ->assertJsonPath('rows.0.status', 'valid')
        ->assertJsonPath('rows.1.status', 'duplicate')
        ->assertJsonPath('rows.1.duplicate.source', 'fichier')
        ->assertJsonPath('rows.1.duplicate.line', 2);
});

it('crée le document préparé par l\'endpoint habituel, en brouillon', function () {
    importStaff();

    $row = analyzeImport([importRow(['cover' => ''])])->assertOk()->json('rows.0');

    $payload = array_filter($row['form'], fn ($v) => $v !== '' && $v !== null && $v !== []);
    $payload['file'] = UploadedFile::fake()->create('laravel.pdf', 100, 'application/pdf');

    $this->post('/api/documents', $payload, ['Accept' => 'application/json'])
        ->assertCreated()
        ->assertJsonPath('status', 'brouillon')
        ->assertJsonPath('title', 'Laravel avancé');
});
