<?php

use App\Models\Category;
use App\Models\Library;
use App\Models\MemberRegistry;
use App\Models\StaffConversation;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function reviewAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

test('une demande de membre sans téléphone ni adresse reprend ceux du registre (et non une erreur 500)', function () {
    $library = Library::factory()->create();
    MemberRegistry::create([
        'library_id' => $library->id,
        'card_number' => 'CARTE-42',
        'matricule' => 'ETU-2020-0042',
        'role' => 'etudiant',
        'last_name' => 'Rakoto',
        'first_name' => 'Jean',
        'phone' => '0340000000',
        'address' => 'Lot II A',
        'gender' => 'masculin',
        'status' => 'actif',
    ]);

    $this->postJson('/api/account-requests/recreate', [
        'library_id' => $library->id,
        'card_number' => 'CARTE-42',
        'email' => 'jean@example.com',
    ])->assertCreated()
        ->assertJsonPath('request.phone', '0340000000')
        ->assertJsonPath('request.address', 'Lot II A');
});

test("l'administrateur peut créer un utilisateur sans envoyer de prénom", function () {
    Sanctum::actingAs(reviewAdmin());

    $this->postJson('/api/users/creer', [
        'last_name' => 'Rabe',
        'email' => 'rabe@example.com',
        'phone' => '0341111111',
        'address' => 'Tana',
        'gender' => 'feminin',
        'date_of_birth' => '1980-01-01',
        'role' => 'enseignant',
        'faculty' => 'Sciences',
        'teaching_specialty' => 'Physique',
    ])->assertCreated();

    expect(User::where('email', 'rabe@example.com')->value('name'))->toBe('Rabe');
});

test('renommer une catégorie met à jour son slug et refuse un nom déjà pris', function () {
    Sanctum::actingAs(reviewAdmin());
    $droit = Category::create(['name' => 'Droit']);
    Category::create(['name' => 'Histoire']);

    $this->putJson("/api/categories/{$droit->id}", ['name' => 'Économie'])->assertOk();
    expect($droit->fresh()->slug)->toBe('economie');

    // L'ancien nom est de nouveau libre : une nouvelle catégorie « Droit » peut être créée.
    $this->postJson('/api/categories', ['name' => 'Droit'])->assertCreated();

    $this->putJson("/api/categories/{$droit->id}", ['name' => 'histoire'])->assertStatus(422);
});

test("un bibliothécaire ouvre la même conversation que celle de « ma conversation » (administrateur actif)", function () {
    $inactiveAdmin = User::factory()->create(['role' => 'administrateur', 'is_active' => false]);
    $admin = reviewAdmin();
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true]);
    Sanctum::actingAs($librarian);

    $mine = $this->getJson('/api/staff-discussions/my-conversation')->assertOk()->json('conversation.id');
    $opened = $this->getJson("/api/staff-discussions/conversation/{$librarian->id}")->assertOk()->json('conversation.id');

    expect($opened)->toBe($mine)
        ->and(StaffConversation::find($opened)->admin_id)->toBe($admin->id)
        ->and(StaffConversation::where('admin_id', $inactiveAdmin->id)->exists())->toBeFalse();
});
