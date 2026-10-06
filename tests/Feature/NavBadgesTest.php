<?php

use App\Models\AccountRequest;
use App\Models\Document;
use App\Models\Feedback;
use App\Models\Library;
use App\Models\ProblemReport;
use App\Models\User;
use App\Services\NotificationService;
use Laravel\Sanctum\Sanctum;

test('un lecteur ne reçoit que ses notifications et messages non lus', function () {
    $reader = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    NotificationService::send($reader, 'test', 'Titre', 'Message');
    NotificationService::send($reader, 'test', 'Titre', 'Message');
    Feedback::create(['user_id' => $reader->id, 'type' => 'general', 'subject' => 'Sujet', 'message' => 'Message', 'status' => 'nouveau']);

    Sanctum::actingAs($reader);

    $this->getJson('/api/nav-badges')
        ->assertOk()
        ->assertExactJson(['notifications' => 2, 'messages' => 0]);
});

test('l’administrateur voit les éléments à traiter', function () {
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $member = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $library = Library::factory()->create();

    AccountRequest::factory()->create(['library_id' => $library->id, 'status' => 'en_attente']);
    AccountRequest::factory()->create(['library_id' => $library->id, 'status' => 'verifiee']);
    AccountRequest::factory()->create(['library_id' => $library->id, 'status' => 'rejetee']);
    AccountRequest::factory()->create(['library_id' => $library->id, 'status' => 'en_attente', 'expires_at' => now()->subDay()]);
    Feedback::create(['user_id' => $member->id, 'type' => 'general', 'subject' => 'A', 'message' => 'A', 'status' => 'nouveau']);
    Feedback::create(['user_id' => $member->id, 'type' => 'general', 'subject' => 'B', 'message' => 'B', 'status' => 'traite']);
    ProblemReport::create(['user_id' => $member->id, 'type' => 'bug', 'subject' => 'C', 'description' => 'C', 'status' => 'nouveau']);
    Document::factory()->count(3)->create(['status' => 'brouillon']);
    Document::factory()->create(['status' => 'publie']);
    Document::factory()->create(['status' => 'publie'])->delete();

    Sanctum::actingAs($admin);

    $this->getJson('/api/nav-badges')
        ->assertOk()
        ->assertJson([
            'account_requests' => 2,
            'feedbacks' => 1,
            'reports' => 1,
            'drafts' => 3,
            'trash' => 1,
            'staff_messages' => 0,
        ]);
});

test('le bibliothécaire ne compte que les demandes à vérifier et seulement les rubriques permises', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
    AccountRequest::factory()->create(['library_id' => $librarian->library_id, 'status' => 'en_attente']);
    AccountRequest::factory()->create(['library_id' => $librarian->library_id, 'status' => 'verifiee']);

    Sanctum::actingAs($librarian);

    $badges = $this->getJson('/api/nav-badges')->assertOk()->json();

    expect($badges['account_requests'])->toBe(1)
        ->and($badges)->not->toHaveKeys(['feedbacks', 'reports', 'trash']);
});

test('les badges exigent une connexion', function () {
    $this->getJson('/api/nav-badges')->assertUnauthorized();
});
