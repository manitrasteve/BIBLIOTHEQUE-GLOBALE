<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class LibraryFactory extends Factory
{
    protected $model = \App\Models\Library::class;

    public function definition(): array
    {
        $suffix = substr(md5((string) microtime(true) . random_int(1000, 9999)), 0, 6);

        return [
            'name' => 'Bibliothèque ' . $suffix,
            'description' => 'Description de la bibliothèque ' . $suffix,
            'address' => 'Adresse test ' . $suffix,
            'location' => 'Mahajanga',
            'opening_hours' => '08h00 - 17h00',
            'opening_days' => 'Lundi - Vendredi',
        ];
    }
}
