<?php

use App\Models\MemberRegistry;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

test('la gestion des permissions ne propose plus la catégorie membres', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $response = $this->actingAs($admin, 'sanctum')->getJson('/api/permissions');

    $response->assertOk();

    $names = collect($response->json())->pluck('name');
    $categories = collect($response->json())->pluck('category')->unique();

    expect($categories)->not->toContain('membres');
    expect($names)->not->toContain('voir_liste_membres');
    expect($names)->not->toContain('importer_membres');
    expect($names)->not->toContain('exporter_membres');
});

test('les autres permissions restent proposées', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $response = $this->actingAs($admin, 'sanctum')->getJson('/api/permissions');

    $categories = collect($response->json())->pluck('category')->unique()->values()->all();

    expect($categories)->toContain('documents', 'corbeille', 'activites', 'notifications', 'bibliotheques');
    expect(collect($response->json())->pluck('name'))->toContain('voir_corbeille', 'modifier_document');
});

test('les routes de l\'ancienne liste des membres n\'existent plus', function () {
    $uris = collect(Route::getRoutes()->getRoutes())->map(fn ($route) => $route->uri());

    expect($uris->contains(fn ($uri) => str_starts_with($uri, 'api/members')))->toBeFalse();
});

test('le registre historique reste utilisé pour réserver les numéros de compte', function () {
    MemberRegistry::create([
        'matricule' => 'ETU-' . now()->year . '-0042',
        'role' => 'etudiant',
        'last_name' => 'Ancien',
        'first_name' => 'Compte',
        'status' => 'desactive',
        'profile_data' => [],
    ]);

    expect(User::generateNumeroCompte('etudiant'))->toBe('ETU-' . now()->year . '-0043');
    expect(DB::table('member_registries')->count())->toBe(1);
});
