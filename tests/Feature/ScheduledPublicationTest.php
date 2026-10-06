<?php

use App\Models\ActivityLog;
use App\Models\AppNotification;
use App\Models\Document;
use App\Models\User;
use App\Services\DocumentPublisher;
use App\Support\PublicationKicker;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;

function schedulingAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

test('programmer un brouillon le passe en « programme » sans le rendre public', function () {
    Sanctum::actingAs($admin = schedulingAdmin());
    $doc = Document::factory()->create(['status' => 'brouillon']);
    $at = now()->addDays(2)->startOfMinute();

    $this->postJson("/api/documents/{$doc->id}/schedule", ['scheduled_at' => $at->toIso8601String()])
        ->assertOk()
        ->assertJsonPath('status', 'programme');

    $doc->refresh();
    expect($doc->scheduled_at->equalTo($at))->toBeTrue()
        ->and($doc->scheduled_by)->toBe($admin->id)
        ->and($doc->published_at)->toBeNull()
        ->and(ActivityLog::where('action', 'programmation_document')->exists())->toBeTrue();

    $this->getJson("/api/documents/{$doc->slug}")->assertNotFound();
    expect($this->getJson('/api/documents-manage')->json('counts.programme'))->toBe(1);
});

test('la date de publication doit être à venir', function () {
    Sanctum::actingAs(schedulingAdmin());
    $doc = Document::factory()->create(['status' => 'brouillon']);

    $this->postJson("/api/documents/{$doc->id}/schedule", ['scheduled_at' => now()->subHour()->toIso8601String()])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('scheduled_at');
    $this->postJson("/api/documents/{$doc->id}/schedule", ['scheduled_at' => now()->addYears(2)->toIso8601String()])
        ->assertUnprocessable();
    expect($doc->fresh()->status)->toBe('brouillon');
});

test('l’heure actuelle (minute en cours) est acceptée', function () {
    Sanctum::actingAs(schedulingAdmin());
    $doc = Document::factory()->create(['status' => 'brouillon']);

    $this->postJson("/api/documents/{$doc->id}/schedule", ['scheduled_at' => now()->startOfMinute()->toIso8601String()])
        ->assertOk();

    expect(DocumentPublisher::publishDue())->toBe(1)->and($doc->fresh()->status)->toBe('publie');
});

test('un document déjà publié ne peut pas être programmé', function () {
    Sanctum::actingAs(schedulingAdmin());
    $doc = Document::factory()->create(['status' => 'publie']);

    $this->postJson("/api/documents/{$doc->id}/schedule", ['scheduled_at' => now()->addDay()->toIso8601String()])
        ->assertUnprocessable();
});

test('annuler la programmation remet le document en brouillon', function () {
    Sanctum::actingAs(schedulingAdmin());
    $doc = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->addDay()]);

    $this->deleteJson("/api/documents/{$doc->id}/schedule")->assertOk();

    $doc->refresh();
    expect($doc->status)->toBe('brouillon')->and($doc->scheduled_at)->toBeNull()
        ->and(ActivityLog::where('action', 'annulation_programmation_document')->exists())->toBeTrue();
});

test('programmer exige la permission de publier', function () {
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => \App\Models\Library::factory()->create()->id]);
    Sanctum::actingAs($librarian);
    $doc = Document::factory()->create(['status' => 'brouillon', 'library_id' => $librarian->library_id]);

    $this->postJson("/api/documents/{$doc->id}/schedule", ['scheduled_at' => now()->addDay()->toIso8601String()])->assertForbidden();
    $this->deleteJson("/api/documents/{$doc->id}/schedule")->assertForbidden();
});

test('à l’heure prévue le document est publié une seule fois et les lecteurs sont notifiés', function () {
    $author = schedulingAdmin();
    $reader = User::factory()->create(['role' => 'etudiant', 'is_active' => true]);
    $due = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->subMinute(), 'scheduled_by' => $author->id]);
    $later = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->addHour(), 'scheduled_by' => $author->id]);

    expect(DocumentPublisher::publishDue())->toBe(1)
        ->and(DocumentPublisher::publishDue())->toBe(0);

    $due->refresh();
    expect($due->status)->toBe('publie')
        ->and($due->published_at)->not->toBeNull()
        ->and($due->scheduled_at)->toBeNull()
        ->and($later->fresh()->status)->toBe('programme')
        ->and(ActivityLog::where('action', 'publication_document')->where('user_id', $author->id)->count())->toBe(1)
        ->and(AppNotification::where('user_id', $reader->id)->where('type', 'document_publie')->count())->toBe(1)
        ->and(AppNotification::where('user_id', $author->id)->where('type', 'document_publie')->exists())->toBeFalse();
});

test('la commande planifiée publie les documents en retard', function () {
    Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->subMinutes(5)]);

    $this->artisan('documents:publier-programmes')->expectsOutputToContain('1 document(s) publié(s)')->assertSuccessful();
});

// Le déclencheur est branché après chaque requête web (AppServiceProvider), au plus une fois par minute.
test('sans planificateur, le déclencheur publie au plus une fois par minute', function () {
    Cache::forget('scheduled-publication-kick');
    $first = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->subMinute()]);

    PublicationKicker::maybeRun();
    expect($first->fresh()->status)->toBe('publie');

    $second = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->subMinute()]);
    PublicationKicker::maybeRun();
    expect($second->fresh()->status)->toBe('programme');

    $this->travel(61)->seconds();
    PublicationKicker::maybeRun();
    expect($second->fresh()->status)->toBe('publie');
});

test('publier tout de suite un document programmé efface la date prévue', function () {
    Sanctum::actingAs(schedulingAdmin());
    $doc = Document::factory()->create(['status' => 'programme', 'scheduled_at' => now()->addDay()]);

    $this->postJson("/api/documents/{$doc->id}/publish")->assertOk();

    expect($doc->fresh()->status)->toBe('publie')->and($doc->fresh()->scheduled_at)->toBeNull();
});
