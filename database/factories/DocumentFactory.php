<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Library;
use Illuminate\Database\Eloquent\Factories\Factory;

class DocumentFactory extends Factory
{
    protected $model = \App\Models\Document::class;

    public function definition(): array
    {
        $suffix = substr(md5((string) microtime(true) . random_int(1000, 9999)), 0, 6);

        return [
            'title' => 'Document ' . $suffix,
            'abstract' => 'Résumé du document ' . $suffix,
            'type' => 'livre',
            'category_id' => Category::factory(),
            'library_id' => Library::factory(),
            'year' => 2026,
            'language' => 'fr',
            'file_path' => 'documents/fake-' . $suffix . '.pdf',
            'access_level' => 'authentifie',
            'status' => 'brouillon',
        ];
    }
}
