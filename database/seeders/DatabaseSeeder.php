<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            LibrarySeeder::class,
            CategorySeeder::class,
            AuthorSeeder::class,
            UserSeeder::class,
            DocumentSeeder::class,
        ]);
    }
}
