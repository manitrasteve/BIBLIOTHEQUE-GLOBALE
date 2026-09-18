<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = ['Droit', 'Médecine', 'Sciences de la mer', 'Finance', 'Informatique', 'Lettres et sciences humaines', 'Agronomie'];

        foreach ($categories as $name) {
            Category::firstOrCreate(['name' => $name]);
        }
    }
}
