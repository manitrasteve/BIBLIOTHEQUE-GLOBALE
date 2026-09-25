<?php

use App\Models\Document;
use App\Services\PdfTextExtractor;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\Storage;

test("une requête API non authentifiée sans en-tête Accept renvoie 401 en JSON (et non une erreur 500)", function () {
    $this->get('/api/me')
        ->assertStatus(401)
        ->assertJson(['message' => 'Unauthenticated.']);
});

test('les PDF de démonstration du seeder sont valides et leur texte est extractible', function () {
    Storage::fake('local');

    $this->seed(DatabaseSeeder::class);

    $documents = Document::whereNotNull('file_path')->where('file_path', 'like', 'documents/demo-%')->get();
    expect($documents)->not->toBeEmpty();

    foreach ($documents as $document) {
        $pages = app(PdfTextExtractor::class)->extractPages(Storage::disk('local')->path($document->file_path));

        expect(implode(' ', $pages))->toContain($document->title);
    }
});
