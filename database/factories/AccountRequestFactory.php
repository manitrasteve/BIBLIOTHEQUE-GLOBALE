<?php

namespace Database\Factories;

use App\Models\Library;
use Illuminate\Database\Eloquent\Factories\Factory;

class AccountRequestFactory extends Factory
{
    protected $model = \App\Models\AccountRequest::class;

    public function definition(): array
    {
        $suffix = substr(md5((string) microtime(true) . random_int(1000, 9999)), 0, 6);

        return [
            'last_name' => 'Nom' . $suffix,
            'first_name' => 'Prenom' . $suffix,
            'email' => 'test-' . $suffix . '@example.com',
            'phone' => '+261331234' . substr($suffix, 0, 3),
            'gender' => 'feminin',
            'address' => 'Adresse test ' . $suffix,
            'role' => 'etudiant',
            'status' => 'en_attente',
            'library_id' => Library::factory(),
        ];
    }
}
