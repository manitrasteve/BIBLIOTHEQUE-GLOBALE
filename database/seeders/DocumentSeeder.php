<?php

namespace Database\Seeders;

use App\Models\Author;
use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

class DocumentSeeder extends Seeder
{
    // Crée quelques documents de démonstration avec un faux PDF minimal,
    // pour pouvoir tester la recherche, la consultation et le RAG sans
    // devoir uploader manuellement des fichiers.
    public function run(): void
    {
        $library = Library::first();
        $category = Category::first();
        $author = Author::first();
        $creator = User::where('role', 'bibliothecaire')->first();

        if (!$library || !$category || !$author || !$creator) {
            $this->command->warn('Lance LibrarySeeder, CategorySeeder, AuthorSeeder et UserSeeder avant DocumentSeeder.');
            return;
        }

        $samples = [
            ['title' => 'Introduction à la gestion financière', 'type' => 'livre', 'year' => 2020],
            ['title' => 'Étude des courants marins de la baie de Bombetoka', 'type' => 'memoire', 'year' => 2023],
            ['title' => 'Droit des affaires à Madagascar', 'type' => 'livre', 'year' => 2019],
        ];

        foreach ($samples as $sample) {
            $fakePdfPath = 'documents/demo-' . \Illuminate\Support\Str::slug($sample['title']) . '.pdf';

            $samplePdfPath = storage_path('app/demo.pdf');

            if (\Illuminate\Support\Facades\File::exists($samplePdfPath)){
            Storage::disk('local')->put($fakePdfPath, \Illuminate\Support\Facades\File::get($samplePdfPath));
            }else{
               $validPdfStructure = "%PDF-1.4\n1 0 obj<</type/catalog/pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0obj<</Type/Page/MediaBox[0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n00000000118 00000 n\ntrailer<</Size 4/Root 1 0 R>>\instartxref\n221\n%%EOF";

               Storage::disk('local')->put($fakePdfPath, $validPdfStructure);
            }

            $document = Document::firstOrCreate(
                ['title' => $sample['title']],
                [
                    'type' => $sample['type'],
                    'category_id' => $category->id,
                    'library_id' => $library->id,
                    'year' => $sample['year'],
                    'language' => 'fr',
                    'abstract' => 'Document de démonstration généré par le seeder.',
                    'access_level' => 'authentifie',
                    'file_path' => $fakePdfPath,
                    'status' => 'publie',
                    'published_at' => now(),
                    'created_by' => $creator->id,
                ]
            );

            $document->authors()->syncWithoutDetaching([$author->id]);
        }
    }
}