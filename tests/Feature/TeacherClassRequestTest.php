<?php

use App\Models\AppNotification;
use App\Models\Library;
use App\Models\TeacherClass;
use App\Models\TeacherClassRequest;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

function requestingTeacher(): User
{
    return User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'name' => 'Dr. Haja']);
}

test('l’enseignant demande une classe et le Service Numérique comme l’administrateur sont notifiés', function () {
    $teacher = requestingTeacher();
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
    Sanctum::actingAs($teacher);

    $this->postJson('/api/teacher-class-requests', ['school' => 'ISSTM', 'level' => 'L1', 'message' => 'Cours d’analyse'])->assertCreated();
    $this->postJson('/api/teacher-class-requests', ['school' => 'ISSTM', 'level' => 'L1'])->assertStatus(422); // déjà en attente
    $this->postJson('/api/teacher-class-requests', ['school' => 'Inconnu', 'level' => 'L1'])->assertUnprocessable();

    expect(AppNotification::where('type', 'classe_demandee')->pluck('user_id')->sort()->values()->all())
        ->toBe(collect([$admin->id, $librarian->id])->sort()->values()->all());

    $this->getJson('/api/teacher-class-requests/mine')->assertOk()
        ->assertJsonPath('requests.0.status', 'en_attente')
        ->assertJsonPath('classes', []);

    Sanctum::actingAs($admin);
    $this->getJson('/api/notifications')->assertOk()->assertJsonPath('data.0.related_url', '/administrateur/enseignants');
    $this->getJson('/api/nav-badges')->assertJsonPath('class_requests', 1);
});

test('valider une demande attribue la classe et prévient l’enseignant', function () {
    $teacher = requestingTeacher();
    $request = TeacherClassRequest::create(['user_id' => $teacher->id, 'school' => 'ISSTM', 'level' => 'L1']);
    Sanctum::actingAs(User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => Library::factory()->create()->id]));

    $this->getJson('/api/teacher-class-requests')->assertOk()->assertJsonPath('0.user.name', 'Dr. Haja');
    $this->postJson("/api/teacher-class-requests/{$request->id}/approve")->assertOk()->assertJsonPath('status', 'acceptee');
    $this->postJson("/api/teacher-class-requests/{$request->id}/approve")->assertStatus(422); // déjà traitée

    expect($teacher->fresh()->teachesClass('ISSTM', 'L1'))->toBeTrue()
        ->and(AppNotification::where('user_id', $teacher->id)->where('type', 'classe_acceptee')->exists())->toBeTrue();

    Sanctum::actingAs($teacher);
    $this->getJson('/api/teacher-class-requests/mine')->assertJsonPath('classes.0.school', 'ISSTM');
    $this->postJson('/api/teacher-class-requests', ['school' => 'ISSTM', 'level' => 'L1'])->assertStatus(422); // déjà attribuée
});

test('refuser une demande exige un motif transmis à l’enseignant', function () {
    $teacher = requestingTeacher();
    $request = TeacherClassRequest::create(['user_id' => $teacher->id, 'school' => 'IUGM', 'level' => 'M1']);
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => true]));

    $this->postJson("/api/teacher-class-requests/{$request->id}/reject", [])->assertUnprocessable();
    $this->postJson("/api/teacher-class-requests/{$request->id}/reject", ['reason' => 'Pas de cours de M1 prévu'])->assertOk();

    expect($request->fresh()->status)->toBe('refusee')
        ->and($teacher->fresh()->teachesClass('IUGM', 'M1'))->toBeFalse()
        ->and(AppNotification::where('user_id', $teacher->id)->where('type', 'classe_refusee')->value('message'))->toContain('Pas de cours de M1 prévu');
});

test('un enseignant peut annuler sa demande en attente, pas celle d’un autre', function () {
    $teacher = requestingTeacher();
    $request = TeacherClassRequest::create(['user_id' => $teacher->id, 'school' => 'ISSTM', 'level' => 'L2']);

    Sanctum::actingAs(requestingTeacher());
    $this->deleteJson("/api/teacher-class-requests/{$request->id}")->assertForbidden();

    Sanctum::actingAs($teacher);
    $this->deleteJson("/api/teacher-class-requests/{$request->id}")->assertOk();
    expect(TeacherClassRequest::count())->toBe(0);
});

test('un enseignant ne peut pas valider de demande et un étudiant ne peut pas en faire', function () {
    $teacher = requestingTeacher();
    $request = TeacherClassRequest::create(['user_id' => $teacher->id, 'school' => 'ISSTM', 'level' => 'L1']);

    Sanctum::actingAs($teacher);
    $this->postJson("/api/teacher-class-requests/{$request->id}/approve")->assertForbidden();
    expect(TeacherClass::count())->toBe(0);

    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));
    $this->postJson('/api/teacher-class-requests', ['school' => 'ISSTM', 'level' => 'L1'])->assertForbidden();
});
