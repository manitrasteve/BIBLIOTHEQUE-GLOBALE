<?php

// « Aujourd'hui » des règles de validation = date de Madagascar (UTC+3), pas la date UTC du serveur.
// 17/11 à 22 h 30 UTC = 18/11 à 1 h 30 à Madagascar.

use App\Models\CourseList;
use App\Models\Document;
use App\Models\TeacherClass;
use App\Models\User;
use App\Support\AccountRequestRules;
use App\Support\LocalDate;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    config(['app.display_timezone' => 'Indian/Antananarivo']);
    Carbon::setTestNow(Carbon::parse('2026-11-17 22:30:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

test('la date du jour suit l\'heure de Madagascar', function () {
    expect(LocalDate::today())->toBe('2026-11-18');

    Carbon::setTestNow(Carbon::parse('2026-12-31 22:30:00', 'UTC'));
    expect(LocalDate::year())->toBe(2027); // déjà le 1er janvier à Madagascar
});

test('une personne qui a 18 ans aujourd\'hui (heure locale) est majeure', function () {
    expect(AccountRequestRules::isAdult('2008-11-18'))->toBeTrue()
        ->and(AccountRequestRules::isAdult('2008-11-19'))->toBeFalse();
});

test('une CIN délivrée aujourd\'hui (heure locale) est acceptée', function () {
    $rules = AccountRequestRules::studentCinRules(request()->merge(['date_of_birth' => '2000-01-01']));

    expect(validator(['cin_number' => '123456789012', 'cin_issued_at' => '2026-11-18'], $rules)->passes())->toBeTrue()
        ->and(validator(['cin_number' => '123456789012', 'cin_issued_at' => '2026-11-19'], $rules)->passes())->toBeFalse();
});

test('la date limite d\'une lecture ne peut pas être la veille, même juste après minuit', function () {
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'school' => 'ISSTM']);
    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'ISSTM', 'level' => 'L1']);
    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'Analyse', 'school' => 'ISSTM', 'level' => 'L1']);
    $document = Document::factory()->create(['status' => 'publie', 'access_level' => 'public']);
    Sanctum::actingAs($teacher);

    // 17/11 : encore « aujourd'hui » en UTC, mais déjà hier à Madagascar.
    $this->postJson("/api/course-lists/{$list->id}/items", ['slug' => $document->slug, 'due_date' => '2026-11-17'])
        ->assertStatus(422)->assertJsonValidationErrors('due_date');

    $this->postJson("/api/course-lists/{$list->id}/items", ['slug' => $document->slug, 'due_date' => '2026-11-18'])
        ->assertCreated();
});
