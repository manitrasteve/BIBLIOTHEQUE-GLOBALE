<?php

namespace Database\Seeders;

use App\Models\Library;
use Illuminate\Database\Seeder;

class LibrarySeeder extends Seeder
{
    public function run(): void
    {
        $libraries = [
            [
                'name' => 'Bibliothèque Centrale',
                'description' => 'Bibliothèque centrale de l\'Université de Mahajanga.',
                'address' => 'Campus universitaire, Ambondrona',
                'location' => 'Ambondrona, Mahajanga',
                'opening_hours' => '08h00 - 17h00',
                'opening_days' => 'Lundi - Vendredi',
            ],
            [
                'name' => 'Bibliothèque IOSTM',
                'description' => 'Institut des Sciences et Techniques de la Mer.',
                'address' => 'Mahajanga',
                'location' => 'Mahajanga',
                'opening_hours' => '08h00 - 16h00',
                'opening_days' => 'Lundi - Vendredi',
            ],
            [
                'name' => 'Bibliothèque Faculté de Médecine',
                'description' => 'Documentation médicale et paramédicale.',
                'address' => 'Mahajanga',
                'location' => 'Mahajanga',
                'opening_hours' => '08h00 - 16h30',
                'opening_days' => 'Lundi - Samedi',
            ],
        ];

        foreach ($libraries as $library) {
            Library::firstOrCreate(['name' => $library['name']], $library);
        }
    }
}
