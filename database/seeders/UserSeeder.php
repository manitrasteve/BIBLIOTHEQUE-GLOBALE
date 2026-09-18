<?php

namespace Database\Seeders;

use App\Models\Library;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $centrale = Library::where('name', 'Bibliothèque Centrale')->first();

        User::firstOrCreate(
            ['email' => 'admin@bm-mahajanga.mg'],
            [
                'name' => 'Administrateur BM',
                'password' => Hash::make('password'),
                'role' => 'administrateur',
                'library_id' => $centrale?->id,
                'is_active' => true,
            ]
        );

        User::firstOrCreate(
            ['email' => 'bibliothecaire@bm-mahajanga.mg'],
            [
                'name' => 'Bibliothécaire Central',
                'password' => Hash::make('password'),
                'role' => 'bibliothecaire',
                'library_id' => $centrale?->id,
                'is_active' => true,
            ]
        );

        User::firstOrCreate(
            ['email' => 'etudiant@bm-mahajanga.mg'],
            [
                'name' => 'Steve Nomenjanahary',
                'password' => Hash::make('password'),
                'role' => 'etudiant',
                'library_id' => $centrale?->id,
                'is_active' => true,
            ]
        );

        $this->command->warn('⚠️  Comptes de démo créés avec le mot de passe "password" — à changer immédiatement en production.');
    }
}
