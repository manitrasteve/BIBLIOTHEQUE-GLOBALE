<?php

// Troisième revue : correctifs précédents incomplets, relevés par relecture et essais dans le navigateur.

use App\Models\Author;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\TeacherClass;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function thirdAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

test('« Mes lectures » trouve aussi un document par son auteur', function () {
    $user = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $document = Document::factory()->create(['status' => 'publie', 'title' => 'Droit foncier']);
    $document->authors()->attach(Author::factory()->create(['name' => 'Rakoto Jean'])->id);
    Consultation::create(['user_id' => $user->id, 'document_id' => $document->id, 'consulted_at' => now()]);
    Sanctum::actingAs($user);

    expect($this->getJson('/api/mes-lectures?search=Rakoto')->assertOk()->json('data'))->toHaveCount(1)
        ->and($this->getJson('/api/mes-lectures?search=Droit')->assertOk()->json('data'))->toHaveCount(1)
        ->and($this->getJson('/api/mes-lectures?search=Zzz')->assertOk()->json('data'))->toHaveCount(0);
});

test('un dépôt refusé ne peut pas contourner le refus par l\'archivage ni par la corbeille', function () {
    $document = Document::factory()->create(['status' => 'refuse']);
    Sanctum::actingAs(thirdAdmin());

    $this->postJson("/api/documents/{$document->id}/archive")->assertStatus(422);
    expect($document->fresh()->status)->toBe('refuse');

    $document->delete();
    $this->postJson("/api/trash/documents/{$document->id}/restore")->assertOk();
    expect($document->fresh()->status)->toBe('refuse');
    $this->postJson("/api/documents/{$document->id}/publish")->assertStatus(422);
});

test('annuler une programmation rend le statut d\'avant, même pour un document d\'enseignant', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true]);
    $archived = Document::factory()->create(['status' => 'archive', 'created_by' => $teacher->id]);
    $submitted = Document::factory()->create(['status' => 'soumis', 'created_by' => $teacher->id]);
    Sanctum::actingAs(thirdAdmin());
    $when = now()->addDay()->toIso8601String();

    foreach ([[$archived, 'archive'], [$submitted, 'soumis']] as [$document, $expected]) {
        $this->postJson("/api/documents/{$document->id}/schedule", ['scheduled_at' => $when])->assertOk();
        // Reprogrammer ne perd pas le statut d'origine.
        $this->postJson("/api/documents/{$document->id}/schedule", ['scheduled_at' => $when])->assertOk();
        $this->deleteJson("/api/documents/{$document->id}/schedule")->assertOk();
        expect($document->fresh()->status)->toBe($expected);
    }
});

test('la configuration de l\'enseignant ne mêle pas les classes d\'un autre centre', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'school' => 'ISSTM']);
    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'IOSTM', 'level' => 'L3']);
    Sanctum::actingAs($teacher);

    $this->getJson('/api/teacher-config')->assertOk()->assertJsonPath('selected', []);
    $this->putJson('/api/teacher-config', ['levels' => ['L1']])->assertOk()->assertJsonPath('selected', ['L1']);
    expect(TeacherClass::where('user_id', $teacher->id)->where('school', 'IOSTM')->exists())->toBeTrue();
});

test('des espaces autour d\'une valeur enregistrée ne bloquent pas le profil', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'school' => ' ISSTM ']);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'niveau_detail' => 'Licence 1 ']);

    Sanctum::actingAs($teacher);
    $this->postJson('/api/profile', ['email' => $teacher->email, 'school' => ' ISSTM '])->assertOk();

    Sanctum::actingAs($student);
    $this->postJson('/api/profile', ['email' => $student->email, 'niveau_detail' => 'Licence 1 '])->assertOk();
});

test('/api sans suite répond en JSON', function () {
    $this->get('/api')->assertNotFound()->assertHeader('content-type', 'application/json');
});
