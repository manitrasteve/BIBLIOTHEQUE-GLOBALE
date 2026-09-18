<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class CategoryFactory extends Factory
{
    protected $model = \App\Models\Category::class;

    public function definition(): array
    {
        $suffix = substr(md5((string) microtime(true) . random_int(1000, 9999)), 0, 6);

        return [
            'name' => 'Categorie-' . $suffix,
            'description' => 'Description de la catégorie ' . $suffix,
        ];
    }
}
