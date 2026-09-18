<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;

function addHistoricalMatricule(string $role, string $matricule, string $status = 'supprime'): void
{
    DB::table('member_registries')->insert([
        'matricule' => $matricule,
        'role' => $role,
        'last_name' => 'Historique',
        'first_name' => 'Membre',
        'status' => $status,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

function setMatriculeSequence(string $role, int $nextNumber): void
{
    DB::table('matricule_sequences')->insert([
        'year' => now()->year,
        'role' => $role,
        'next_number' => $nextNumber,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

test('une séquence désynchronisée est réalignée sur le registre historique', function () {
    $year = now()->year;
    addHistoricalMatricule('etudiant', "ETU-{$year}-0001");
    addHistoricalMatricule('etudiant', "ETU-{$year}-0002");
    setMatriculeSequence('etudiant', 2);

    expect(User::generateMatricule('etudiant'))->toBe("ETU-{$year}-0003");
    expect(DB::table('matricule_sequences')->where('year', $year)->where('role', 'etudiant')->value('next_number'))
        ->toBe(4);
});

test('le plus grand matricule historique est toujours dépassé', function () {
    $year = now()->year;
    addHistoricalMatricule('etudiant', "ETU-{$year}-0005");
    setMatriculeSequence('etudiant', 2);

    expect(User::generateMatricule('etudiant'))->toBe("ETU-{$year}-0006");
});

test('un matricule conservé après une suppression définitive reste réservé', function () {
    $year = now()->year;
    addHistoricalMatricule('etudiant', "ETU-{$year}-0002");
    setMatriculeSequence('etudiant', 2);

    expect(User::generateMatricule('etudiant'))->toBe("ETU-{$year}-0003");
});

test('les générations successives utilisent des numéros distincts', function () {
    $year = now()->year;

    expect([
        User::generateMatricule('etudiant'),
        User::generateMatricule('etudiant'),
        User::generateMatricule('etudiant'),
    ])->toBe([
        "ETU-{$year}-0001",
        "ETU-{$year}-0002",
        "ETU-{$year}-0003",
    ]);
});

test('les autres rôles conservent leur séquence et leur format', function () {
    $year = now()->year;
    addHistoricalMatricule('etudiant', "ETU-{$year}-0005");
    setMatriculeSequence('etudiant', 2);

    expect(User::generateMatricule('enseignant'))->toBe("ENS-{$year}-0001");
    expect(User::generateMatricule('chercheur'))->toBe("CHR-{$year}-0001");
});
