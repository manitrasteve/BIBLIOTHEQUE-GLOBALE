<?php

// Endpoint /notifications/recent : compteur non lus + dernière notification non lue,
// support du polling côté client (toast à l'arrivée d'une nouveauté).

use App\Models\AppNotification;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

test('recent renvoie le nombre de non-lues et la plus récente', function () {
    $user = User::factory()->create(['is_active' => true]);

    AppNotification::create(['user_id' => $user->id, 'type' => 'info', 'title' => 'Ancienne', 'created_at' => now()->subHour()]);
    AppNotification::create(['user_id' => $user->id, 'type' => 'info', 'title' => 'La plus récente']);
    AppNotification::create(['user_id' => $user->id, 'type' => 'info', 'title' => 'Déjà lue', 'read_at' => now()]);

    Sanctum::actingAs($user);

    $this->getJson('/api/notifications/recent')
        ->assertOk()
        ->assertJsonPath('count', 2)
        ->assertJsonPath('latest.title', 'La plus récente');
});

test('recent ne renvoie rien quand tout est lu', function () {
    $user = User::factory()->create(['is_active' => true]);
    AppNotification::create(['user_id' => $user->id, 'type' => 'info', 'title' => 'Lue', 'read_at' => now()]);

    Sanctum::actingAs($user);

    $this->getJson('/api/notifications/recent')
        ->assertOk()
        ->assertJsonPath('count', 0)
        ->assertJsonPath('latest', null);
});

test('recent est réservé à chaque utilisateur (ne voit pas les notifications d\'un autre)', function () {
    $me = User::factory()->create(['is_active' => true]);
    $other = User::factory()->create(['is_active' => true]);
    AppNotification::create(['user_id' => $other->id, 'type' => 'info', 'title' => "D'un autre"]);

    Sanctum::actingAs($me);

    $this->getJson('/api/notifications/recent')
        ->assertOk()
        ->assertJsonPath('count', 0)
        ->assertJsonPath('latest', null);
});
