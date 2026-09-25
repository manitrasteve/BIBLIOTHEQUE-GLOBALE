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
               Storage::disk('local')->put($fakePdfPath, $this->buildDemoPdf([
                   $sample['title'],
                   'Document de démonstration généré par le seeder.',
               ]));
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

    // Construit un PDF valide d'une page contenant les lignes données : les
    // offsets de la table xref sont calculés, sinon le parseur PDF (extraction
    // de texte, RAG) et la visionneuse refusent le fichier.
    private function buildDemoPdf(array $lines): string
    {
        $escape = fn (string $s) => strtr(
            iconv('UTF-8', 'Windows-1252//TRANSLIT', $s) ?: $s,
            ['\\' => '\\\\', '(' => '\\(', ')' => '\\)']
        );

        $content = "BT\n/F1 14 Tf\n72 720 Td\n18 TL\n";
        foreach ($lines as $line) {
            $content .= '(' . $escape($line) . ") Tj T*\n";
        }
        $content .= "ET";

        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
            '<< /Type /Page /MediaBox [0 0 612 792] /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
            '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream",
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $i => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1) . " 0 obj\n" . $object . "\nendobj\n";
        }

        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= 'trailer << /Size ' . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";

        return $pdf;
    }
}