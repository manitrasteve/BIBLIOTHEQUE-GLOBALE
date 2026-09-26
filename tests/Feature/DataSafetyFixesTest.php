<?php

use App\Models\AccountRequest;
use App\Models\Category;
use App\Models\Document;
use App\Models\Feedback;
use App\Models\Library;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

function adminUser(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

test('une bibliothèque qui contient des documents (Corbeille comprise) ne peut pas être supprimée', function () {
    $library = Library::factory()->create();
    $document = Document::factory()->create(['library_id' => $library->id]);
    $document->delete(); // en Corbeille : serait effacé définitivement par la cascade SQL

    $this->actingAs(adminUser(), 'sanctum')
        ->deleteJson("/api/libraries/{$library->id}")
        ->assertStatus(422);

    expect(Library::find($library->id))->not->toBeNull();
    expect(Document::withTrashed()->find($document->id))->not->toBeNull();
});

test('une bibliothèque vide peut être supprimée', function () {
    $library = Library::factory()->create();

    $this->actingAs(adminUser(), 'sanctum')
        ->deleteJson("/api/libraries/{$library->id}")
        ->assertOk();

    expect(Library::find($library->id))->toBeNull();
});

test('une catégorie utilisée par un document ne peut pas être supprimée', function () {
    $document = Document::factory()->create();

    $this->actingAs(adminUser(), 'sanctum')
        ->deleteJson("/api/categories/{$document->category_id}")
        ->assertStatus(422);

    expect(Document::find($document->id))->not->toBeNull();
});

test('créer une catégorie en double renvoie une erreur de validation et non une erreur 500', function () {
    Category::create(['name' => 'Droit']);

    $this->actingAs(adminUser(), 'sanctum')
        ->postJson('/api/categories', ['name' => 'droit'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('name');
});

test('désactiver un compte ferme ses sessions ouvertes', function () {
    Mail::fake();
    $user = User::factory()->create();
    $user->createToken('api');

    $this->actingAs(adminUser(), 'sanctum')
        ->postJson("/api/users/{$user->id}/deactivate", ['reason' => 'Test'])
        ->assertOk();

    expect($user->tokens()->count())->toBe(0);
});

test("l'administrateur ne peut pas désactiver son propre compte", function () {
    $admin = adminUser();

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/users/{$admin->id}/deactivate", ['reason' => 'Test'])
        ->assertStatus(422);

    expect($admin->fresh()->is_active)->toBeTrue();
});

test('supprimer un compte révoque ses jetons (ils redeviendraient valides après restauration)', function () {
    Mail::fake();
    $user = User::factory()->create();
    $user->createToken('api');

    $this->actingAs(adminUser(), 'sanctum')
        ->deleteJson("/api/users/{$user->id}", ['reason' => 'Test'])
        ->assertOk();

    expect($user->tokens()->count())->toBe(0);
});

test('changer son mot de passe ferme les autres sessions mais garde la session courante', function () {
    $user = User::factory()->create();
    $other = $user->createToken('autre-appareil')->plainTextToken;
    $current = $user->createToken('api')->plainTextToken;

    $this->withToken($current)
        ->postJson('/api/change-password', [
            'current_password' => 'password',
            'password' => 'nouveau-mot-de-passe',
            'password_confirmation' => 'nouveau-mot-de-passe',
        ])
        ->assertOk();

    expect($user->tokens()->pluck('name')->all())->toBe(['api']);
});

test("répondre à l'avis d'un compte supprimé ne provoque pas d'erreur 500", function () {
    $author = User::factory()->create();
    $feedback = Feedback::create(['user_id' => $author->id, 'type' => 'general', 'subject' => 'Sujet', 'message' => 'Message']);
    $author->delete();

    $this->actingAs(adminUser(), 'sanctum')
        ->postJson("/api/feedbacks/{$feedback->id}/reply", ['reply' => 'Merci', 'status' => 'traite'])
        ->assertOk();
});

test('le reçu public de demande ne divulgue pas la fiche complète du personnel', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'cin_number' => '123456789012', 'phone' => '0340000000']);
    $request = AccountRequest::factory()->create(['processed_by' => $librarian->id, 'setup_token_hash' => 'hash']);

    $response = $this->getJson("/api/account-requests/{$request->uuid}")->assertOk();

    expect($response->json('request.processed_by'))->toBe(['id' => $librarian->id, 'name' => $librarian->name]);
    expect($response->getContent())->not->toContain('123456789012')->not->toContain('setup_token_hash');
});

test('publier un document déjà publié ne renotifie pas les utilisateurs', function () {
    Queue::fake();
    $document = Document::factory()->create(['status' => 'publie', 'published_at' => now()->subDay()]);
    $publishedAt = $document->published_at;

    $this->actingAs(adminUser(), 'sanctum')
        ->postJson("/api/documents/{$document->id}/publish")
        ->assertOk();

    Queue::assertNothingPushed();
    expect($document->fresh()->published_at->equalTo($publishedAt))->toBeTrue();
});

test('la suppression définitive d\'un document efface son PDF et sa couverture', function () {
    Storage::fake('local');
    Storage::fake('public');
    Storage::disk('local')->put('documents/a.pdf', '%PDF');
    Storage::disk('public')->put('covers/a.jpg', 'img');
    $document = Document::factory()->create(['file_path' => 'documents/a.pdf', 'cover_path' => 'covers/a.jpg']);
    $document->delete();

    $this->actingAs(adminUser(), 'sanctum')->deleteJson('/api/trash')->assertOk();

    Storage::disk('local')->assertMissing('documents/a.pdf');
    Storage::disk('public')->assertMissing('covers/a.jpg');
});

test("la page d'accueil n'affiche que les catégories ayant des documents publiés", function () {
    $droit = Category::create(['name' => 'Droit']);
    $vide = Category::create(['name' => 'Agronomie']);
    $brouillon = Category::create(['name' => 'Médecine']);
    $corbeille = Category::create(['name' => 'Finance']);
    Document::factory()->count(2)->create(['category_id' => $droit->id, 'status' => 'publie']);
    Document::factory()->create(['category_id' => $brouillon->id, 'status' => 'brouillon']);
    Document::factory()->create(['category_id' => $corbeille->id, 'status' => 'publie'])->delete();

    $response = $this->getJson('/api/categories?published=1')->assertOk();

    expect(collect($response->json())->pluck('documents_count', 'name')->all())->toBe(['Droit' => 2]);
    // Sans le paramètre, les formulaires de recherche gardent toutes les catégories.
    expect($this->getJson('/api/categories')->json())->toHaveCount(4);
});
