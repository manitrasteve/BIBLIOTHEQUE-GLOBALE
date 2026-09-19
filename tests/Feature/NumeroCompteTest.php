<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;

test('un compte créé sans validation ne reçoit pas de numéro de compte', function () {
    $user = User::factory()->create(['role' => 'etudiant']);

    expect($user->numero_compte)->toBeNull();
});

test('le numéro de compte est unique et expose la valeur stockée', function () {
    $year = now()->year;

    $first = User::generateNumeroCompte('etudiant');
    $second = User::generateNumeroCompte('etudiant');

    expect($first)->toBe("ETU-{$year}-0001");
    expect($second)->toBe("ETU-{$year}-0002");

    $user = User::factory()->create(['role' => 'etudiant', 'matricule' => $first]);
    expect($user->numero_compte)->toBe($first);
    expect($user->toArray())->toHaveKey('numero_compte', $first);
});

test('un numéro de compte n\'est jamais réattribué après suppression définitive', function () {
    $number = User::generateNumeroCompte('etudiant');
    $user = User::factory()->create(['role' => 'etudiant', 'matricule' => $number]);

    DB::table('users')->where('id', $user->id)->delete();

    expect(User::generateNumeroCompte('etudiant'))->not->toBe($number);
});
