<?php

use App\Models\Permission;
use App\Models\User;

test('un bibliothécaire sans voir_corbeille reçoit 403 sur l API de corbeille', function () {
    $librarian = User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
    ]);

    $this->actingAs($librarian, 'sanctum')
        ->getJson('/api/trash')
        ->assertForbidden();
});

test('un bibliothécaire avec voir_corbeille accède à l API de corbeille', function () {
    $librarian = User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
    ]);
    $librarian->permissions()->attach(
        Permission::where('name', 'voir_corbeille')->firstOrFail()->id,
    );

    $this->actingAs($librarian, 'sanctum')
        ->getJson('/api/trash')
        ->assertOk();
});

test('seul un administrateur peut consulter la gestion des permissions', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);

    $this->actingAs($librarian, 'sanctum')
        ->getJson('/api/permissions')
        ->assertForbidden();

    $this->actingAs($admin, 'sanctum')
        ->getJson('/api/permissions')
        ->assertOk()
        ->assertJsonFragment(['name' => 'voir_corbeille']);
});

test('un administrateur alias admin conserve l accès à la gestion des permissions', function () {
    $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

    $this->actingAs($admin, 'sanctum')
        ->getJson('/api/permissions')
        ->assertOk();
});

test('une modification de permissions crée une notification groupée et une activité', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'name' => 'Admin Test']);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'name' => 'Jean Rakoto']);

    $this->actingAs($admin, 'sanctum')
        ->putJson("/api/bibliothecaires/{$librarian->id}/permissions", [
            'permissions' => ['voir_corbeille', 'restaurer_corbeille'],
        ])
        ->assertOk()
        ->assertJsonCount(2, 'added');

    $this->assertDatabaseHas('user_permissions', ['user_id' => $librarian->id]);
    $this->assertDatabaseHas('app_notifications', ['user_id' => $librarian->id, 'type' => 'permissions_mises_a_jour']);
    $this->assertDatabaseHas('activity_logs', ['user_id' => $admin->id, 'action' => 'permissions_modifiees']);
});

test('une sauvegarde sans changement ne crée ni notification ni activité', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);

    $this->actingAs($admin, 'sanctum')
        ->putJson("/api/bibliothecaires/{$librarian->id}/permissions", ['permissions' => []])
        ->assertOk()
        ->assertJsonPath('message', 'Aucune modification à enregistrer.');

    $this->assertDatabaseMissing('app_notifications', ['user_id' => $librarian->id]);
    $this->assertDatabaseMissing('activity_logs', ['user_id' => $admin->id, 'action' => 'permissions_modifiees']);
});
