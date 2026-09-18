<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

test('un utilisateur actif peut se connecter', function () {
    $user = User::factory()->create([
        'password' => Hash::make('password123'),
        'is_active' => true,
    ]);

    $response = $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'password123',
    ]);

    $response->assertOk()->assertJsonStructure(['user', 'token']);
});

test('un utilisateur inactif ne peut pas se connecter', function () {
    $user = User::factory()->create([
        'password' => Hash::make('password123'),
        'is_active' => false,
    ]);

    $response = $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'password123',
    ]);

    $response->assertStatus(422);
});

test('un mauvais mot de passe est rejeté', function () {
    $user = User::factory()->create([
        'password' => Hash::make('password123'),
        'is_active' => true,
    ]);

    $response = $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'mauvais-mot-de-passe',
    ]);

    $response->assertStatus(422);
});

test('une photo de profil est enregistrée et renvoyée avec une url publique', function () {
    Storage::fake('public');

    $user = User::factory()->create([
        'password' => Hash::make('password123'),
        'is_active' => true,
    ]);

    $file = UploadedFile::fake()->image('avatar.png', 200, 200);

    $response = $this->actingAs($user, 'web')->post('/api/profile', [
        'email' => $user->email,
        'phone' => '+26134123456',
        'address' => 'Mahajanga',
        'photo' => $file,
    ]);

    $response->assertOk();
    $response->assertJsonPath('photo_path', fn ($path) => is_string($path) && str_starts_with($path, 'profiles/'));
    $response->assertJsonPath('photo_url', fn ($url) => is_string($url) && str_contains($url, '/storage/profiles/'));
});
