<?php

namespace Database\Seeders;

use App\Models\Author;
use Illuminate\Database\Seeder;

class AuthorSeeder extends Seeder
{
    public function run(): void
    {
        $authors = ['Jean Rakoto', 'Marie Rasoanaivo', 'Paul Andriamalala', 'Sophie Ravelojaona', 'Hery Randrianasolo'];

        foreach ($authors as $name) {
            Author::firstOrCreate(['name' => $name]);
        }
    }
}
