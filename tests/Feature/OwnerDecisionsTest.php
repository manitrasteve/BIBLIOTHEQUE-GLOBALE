<?php

// Trois décisions du propriétaire du projet : centre de l'enseignant verrouillé, jetons de connexion
// limités à 30 jours, catégorie suivie par un thème de veille non supprimable.

use App\Models\Category;
use App\Models\TeacherClass;
use App\Models\User;
use App\Models\WatchTopic;
use Laravel\Sanctum\Sanctum;

test('un enseignant ne peut pas changer son établissement depuis son profil', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'school' => 'ISSTM']);
    Sanctum::actingAs($teacher);

    $this->postJson('/api/profile', ['email' => $teacher->email, 'school' => 'IOSTM'])
        ->assertStatus(422)->assertJsonValidationErrors('school');
    $this->postJson('/api/profile', ['email' => $teacher->email, 'school' => null])
        ->assertStatus(422)->assertJsonValidationErrors('school');
    expect($teacher->fresh()->school)->toBe('ISSTM');

    // Le reste du profil reste modifiable, avec le même établissement ou sans le renvoyer.
    $this->postJson('/api/profile', ['email' => $teacher->email, 'school' => 'ISSTM', 'phone' => '0340000001'])->assertOk();
    $this->postJson('/api/profile', ['email' => $teacher->email, 'phone' => '0340000002'])->assertOk();
    expect($teacher->fresh()->phone)->toBe('0340000002');
});

test('un enseignant sans établissement peut renseigner le sien, et ses classes le reprennent', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'school' => null]);
    TeacherClass::create(['user_id' => $teacher->id, 'school' => '', 'level' => 'L1']);
    Sanctum::actingAs($teacher);

    $this->postJson('/api/profile', ['email' => $teacher->email, 'school' => 'ISSTM'])->assertOk();

    expect($teacher->fresh()->school)->toBe('ISSTM')
        ->and(TeacherClass::where('user_id', $teacher->id)->value('school'))->toBe('ISSTM');
});

test('un étudiant peut toujours changer son établissement', function () {
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'school' => 'ISSTM']);
    Sanctum::actingAs($student);

    $this->postJson('/api/profile', ['email' => $student->email, 'school' => 'IOSTM'])->assertOk();

    expect($student->fresh()->school)->toBe('IOSTM');
});

test('un jeton de connexion expire au bout de 30 jours', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $token = $user->createToken('test')->plainTextToken;

    $this->travel(29)->days();
    $this->withToken($token)->getJson('/api/profile')->assertOk();

    $this->app['auth']->forgetGuards();
    $this->travel(2)->days();
    $this->withToken($token)->getJson('/api/profile')->assertUnauthorized();
});

test('une catégorie suivie par un thème de veille ne peut pas être supprimée', function () {
    $category = Category::factory()->create();
    $researcher = User::factory()->create(['role' => 'chercheur', 'is_active' => true]);
    $topic = WatchTopic::create(['user_id' => $researcher->id, 'type' => 'domaine', 'category_id' => $category->id]);
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->deleteJson("/api/categories/{$category->id}")
        ->assertStatus(422)
        ->assertJsonPath('message', fn ($m) => str_contains($m, 'thème'));
    expect(Category::find($category->id))->not->toBeNull()
        ->and(WatchTopic::find($topic->id))->not->toBeNull();

    $topic->delete();
    $this->deleteJson("/api/categories/{$category->id}")->assertOk();
    expect(Category::find($category->id))->toBeNull();
});
