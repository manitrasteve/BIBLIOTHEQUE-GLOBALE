<?php

use App\Models\AccountRequest;
use App\Models\ActivityLog;
use App\Models\Author;
use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use App\Services\ActivityLogService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function auditAdmin(): User
{
    return User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
}

function auditLibrarian(?Library $library = null, array $permissions = []): User
{
    $librarian = User::factory()->create([
        'role' => 'bibliothecaire',
        'is_active' => true,
        'library_id' => ($library ?? Library::factory()->create())->id,
    ]);
    foreach ($permissions as $name) {
        $librarian->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
    }

    return $librarian;
}

function lastAudit(string $action): ?ActivityLog
{
    return ActivityLog::where('action', $action)->latest('id')->first();
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();
});

// ---------- Documents ----------

test('l\'ajout d\'un document enregistre qui, quoi, quel élément, quelle bibliothèque et quand', function () {
    $this->travelTo('2026-04-12 14:35:00');
    $library = Library::factory()->create();
    $librarian = auditLibrarian($library);
    Sanctum::actingAs($librarian);

    $id = $this->post('/api/documents', [
        'title' => 'Algorithmique avancée', 'type' => 'Livre', 'category' => 'Informatique', 'library_id' => $library->id,
        'language' => 'Français', 'access_level' => 'authentifie', 'file' => UploadedFile::fake()->create('a.pdf', 50, 'application/pdf'),
    ], ['Accept' => 'application/json'])->assertCreated()->json('id');

    $log = lastAudit('creation_document');
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($librarian->id)
        ->and($log->subject_type)->toBe(Document::class)
        ->and($log->subject_id)->toBe($id)
        ->and($log->subject_label)->toBe('Algorithmique avancée')
        ->and($log->library_id)->toBe($library->id)
        ->and($log->created_at->format('Y-m-d H:i:s'))->toBe('2026-04-12 14:35:00');
});

test('une modification enregistre uniquement les champs changés avec leur valeur avant et après', function () {
    $library = Library::factory()->create();
    $newLibrary = Library::factory()->create(['name' => 'Bibliothèque Sud']);
    $author = Author::factory()->create(['name' => 'Rakoto']);
    $document = Document::factory()->create([
        'title' => 'Ancien titre', 'type' => 'livre', 'niveau' => 'L2', 'library_id' => $library->id, 'language' => 'fr', 'year' => 2020,
        'category_id' => Category::factory()->create(['name' => 'Droit'])->id,
    ]);
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->post("/api/documents/{$document->id}", [
        'title' => 'Nouveau titre', 'type' => 'livre', 'niveau' => '', 'category' => 'Informatique',
        'library_id' => $newLibrary->id, 'language' => 'fr', 'year' => '2020', 'author_ids' => [$author->id],
    ], ['Accept' => 'application/json'])->assertOk();

    $log = lastAudit('modification_document');
    expect($log->user_id)->toBe($admin->id)
        ->and($log->subject_id)->toBe($document->id)
        ->and($log->subject_label)->toBe('Nouveau titre')
        ->and($log->library_id)->toBe($newLibrary->id)
        ->and($log->changes)->toBe([
            'title' => ['before' => 'Ancien titre', 'after' => 'Nouveau titre'],
            'niveau' => ['before' => 'L2', 'after' => null],
            'category' => ['before' => 'Droit', 'after' => 'Informatique'],
            'library' => ['before' => $library->name, 'after' => 'Bibliothèque Sud'],
            'authors' => ['before' => null, 'after' => ['Rakoto']],
        ]);
});

test('une modification sans changement réel, refusée ou invalide n\'est pas enregistrée', function () {
    $document = Document::factory()->create(['title' => 'Titre', 'language' => 'fr', 'year' => 2020]);
    Sanctum::actingAs(auditAdmin());

    // Mêmes valeurs → rien à journaliser.
    $this->post("/api/documents/{$document->id}", ['title' => 'Titre', 'language' => 'fr', 'year' => '2020'], ['Accept' => 'application/json'])->assertOk();
    // Validation en échec.
    $this->post("/api/documents/{$document->id}", ['title' => ''], ['Accept' => 'application/json'])->assertStatus(422);
    // Étudiant refusé.
    Sanctum::actingAs(User::factory()->create(['role' => 'etudiant', 'is_active' => true]));
    $this->post("/api/documents/{$document->id}", ['title' => 'Piraté'], ['Accept' => 'application/json'])->assertForbidden();

    expect(ActivityLog::where('action', 'modification_document')->count())->toBe(0);
});

test('publication, archivage et suppression sont enregistrés avec l\'auteur, la bibliothèque et le statut', function () {
    $library = Library::factory()->create();
    $document = Document::factory()->create(['status' => 'brouillon', 'title' => 'À publier', 'library_id' => $library->id]);
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->postJson("/api/documents/{$document->id}/publish")->assertOk();
    $this->postJson("/api/documents/{$document->id}/archive")->assertOk();
    $this->deleteJson("/api/documents/{$document->id}")->assertOk();

    foreach (['publication_document', 'archivage_document', 'suppression_document'] as $action) {
        $log = lastAudit($action);
        expect($log)->not->toBeNull($action)
            ->and($log->user_id)->toBe($admin->id)
            ->and($log->subject_id)->toBe($document->id)
            ->and($log->subject_label)->toBe('À publier')
            ->and($log->library_id)->toBe($library->id);
    }
    expect(lastAudit('publication_document')->changes)->toBe(['status' => ['before' => 'brouillon', 'after' => 'publie']])
        ->and(lastAudit('archivage_document')->changes)->toBe(['status' => ['before' => 'publie', 'after' => 'archive']]);
});

test('une action refusée (permission manquante) n\'est pas enregistrée', function () {
    $document = Document::factory()->create(['status' => 'brouillon']);
    Sanctum::actingAs(auditLibrarian());

    $this->postJson("/api/documents/{$document->id}/publish")->assertForbidden();
    $this->deleteJson("/api/documents/{$document->id}")->assertForbidden();

    expect(ActivityLog::whereIn('action', ['publication_document', 'suppression_document'])->count())->toBe(0);
});

test('restauration et suppression définitive depuis la corbeille sont enregistrées ; le titre reste lisible', function () {
    $library = Library::factory()->create();
    $restored = Document::factory()->create(['status' => 'publie', 'title' => 'À restaurer', 'library_id' => $library->id]);
    $purged = Document::factory()->create(['title' => 'À purger', 'library_id' => $library->id]);
    $restored->delete();
    $purged->delete();
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->postJson("/api/trash/documents/{$restored->id}/restore")->assertOk();
    $this->deleteJson("/api/trash/documents/{$purged->id}")->assertOk();

    $restore = lastAudit('restauration_document');
    $purge = lastAudit('suppression_definitive_document');
    expect($restore->user_id)->toBe($admin->id)->and($restore->subject_label)->toBe('À restaurer')->and($restore->library_id)->toBe($library->id)
        ->and($restore->changes)->toBe(['status' => ['before' => 'publie', 'after' => 'brouillon']])
        ->and($purge->subject_label)->toBe('À purger')->and($purge->subject_id)->toBe($purged->id)
        ->and(Document::withTrashed()->find($purged->id))->toBeNull(); // le journal survit à la suppression
});

test('vider la corbeille laisse une entrée récapitulative', function () {
    Document::factory()->count(2)->create()->each->delete();
    User::factory()->create(['role' => 'etudiant'])->delete();
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->deleteJson('/api/trash')->assertOk();

    $log = lastAudit('vidage_corbeille');
    expect($log->user_id)->toBe($admin->id)->and($log->changes['documents']['before'])->toBe(2)->and($log->changes['utilisateurs']['before'])->toBe(1);
});

// ---------- Bibliothèques ----------

test('création, modification et suppression d\'une bibliothèque sont enregistrées', function () {
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $id = $this->post('/api/libraries', [
        'name' => 'Bibliothèque Nord', 'address' => 'Rue 1', 'location' => 'Nord', 'opening_hours' => '08h - 17h', 'opening_days' => 'Lun - Ven',
        'photo' => UploadedFile::fake()->image('c.jpg'),
    ], ['Accept' => 'application/json'])->assertCreated()->json('id');

    $this->post("/api/libraries/{$id}", ['name' => 'Bibliothèque Nord 2', 'address' => 'Rue 1'], ['Accept' => 'application/json'])->assertOk();
    $this->post("/api/libraries/{$id}", ['name' => 'Bibliothèque Nord 2'], ['Accept' => 'application/json'])->assertOk(); // aucun changement
    $this->deleteJson("/api/libraries/{$id}")->assertOk();

    $created = lastAudit('creation_bibliotheque');
    $updated = lastAudit('modification_bibliotheque');
    $deleted = lastAudit('suppression_bibliotheque');
    expect($created->user_id)->toBe($admin->id)->and($created->library_id)->toBe($id)->and($created->subject_label)->toBe('Bibliothèque Nord')
        ->and($updated->changes)->toBe(['name' => ['before' => 'Bibliothèque Nord', 'after' => 'Bibliothèque Nord 2']])
        ->and(ActivityLog::where('action', 'modification_bibliotheque')->count())->toBe(1)
        ->and($deleted->subject_label)->toBe('Bibliothèque Nord 2')->and($deleted->library_id)->toBe($id);
});

test('un bibliothécaire qui ajoute une bibliothèque est identifié ; un refus n\'est pas journalisé', function () {
    $librarian = auditLibrarian(null, ['ajouter_bibliotheque']);
    Sanctum::actingAs($librarian);
    $this->post('/api/libraries', [
        'name' => 'Créée par bibliothécaire', 'address' => 'A', 'location' => 'B', 'opening_hours' => 'C', 'opening_days' => 'D',
        'photo' => UploadedFile::fake()->image('c.jpg'),
    ], ['Accept' => 'application/json'])->assertCreated();

    expect(lastAudit('creation_bibliotheque')->user_id)->toBe($librarian->id);

    Sanctum::actingAs(auditLibrarian());
    $this->post('/api/libraries', ['name' => 'Refusée'], ['Accept' => 'application/json'])->assertForbidden();
    expect(ActivityLog::where('action', 'creation_bibliotheque')->count())->toBe(1);
});

// ---------- Utilisateurs ----------

test('désactivation, réactivation et suppression d\'un compte indiquent la bibliothèque et le nom du compte', function () {
    $library = Library::factory()->create();
    $target = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $library->id, 'name' => 'Rakoto Jean']);
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->postJson("/api/users/{$target->id}/deactivate", ['reason' => 'Test'])->assertOk();
    $this->postJson("/api/users/{$target->id}/reactivate")->assertOk();
    $this->deleteJson("/api/users/{$target->id}", ['reason' => 'Test'])->assertOk();

    foreach (['desactivation_compte', 'reactivation_compte', 'suppression_utilisateur'] as $action) {
        $log = lastAudit($action);
        expect($log->user_id)->toBe($admin->id)->and($log->subject_id)->toBe($target->id)
            ->and($log->subject_label)->toBe('Rakoto Jean')->and($log->library_id)->toBe($library->id);
    }
});

test('la création d\'un compte à partir d\'un ticket puis sa validation sont enregistrées', function () {
    $library = Library::factory()->create();
    $librarian = auditLibrarian($library);
    $admin = auditAdmin();

    $ticket = AccountRequest::factory()->create(['library_id' => $library->id]);
    $this->actingAs($librarian, 'sanctum')->postJson("/api/account-requests/{$ticket->id}/create-account", [
        'email' => 'nouveau@example.com', 'role' => 'etudiant', 'password' => 'motdepasse123',
    ])->assertCreated();
    $created = lastAudit('creation_compte');
    expect($created->user_id)->toBe($librarian->id)->and($created->library_id)->toBe($library->id)
        ->and($created->subject_id)->toBe(User::where('email', 'nouveau@example.com')->value('id'));

    $verified = AccountRequest::factory()->create(['library_id' => $library->id, 'status' => 'verifiee', 'validation_deadline_at' => now()->addDay()]);
    $this->actingAs($admin, 'sanctum')->postJson("/api/account-requests/{$verified->id}/validate")->assertOk();
    $validated = lastAudit('validation_compte');
    expect($validated->user_id)->toBe($admin->id)->and($validated->library_id)->toBe($library->id);

    // Une validation répétée ne crée pas de doublon dans le journal.
    $this->actingAs($admin, 'sanctum')->postJson("/api/account-requests/{$verified->id}/validate")->assertOk();
    expect(ActivityLog::where('action', 'validation_compte')->count())->toBe(1);
});

test('la création directe d\'un compte par l\'administrateur est enregistrée', function () {
    $library = Library::factory()->create();
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->postJson('/api/users/creer', [
        'library_id' => $library->id, 'role' => 'enseignant', 'last_name' => 'Rabe', 'first_name' => 'Jean', 'email' => 'enseignant.audit@example.test',
        'phone' => '0340000000', 'address' => 'Mahajanga', 'gender' => 'masculin', 'date_of_birth' => '1980-01-01',
        'faculty' => 'IOSTM', 'teaching_specialty' => 'Informatique',
    ])->assertCreated();

    $log = lastAudit('creation_compte');
    expect($log->user_id)->toBe($admin->id)->and($log->library_id)->toBe($library->id)
        ->and($log->subject_id)->toBe(User::where('email', 'enseignant.audit@example.test')->value('id'))
        ->and($log->subject_label)->toContain('Rabe');
});

test('la création d\'un bibliothécaire indique sa bibliothèque', function () {
    $library = Library::factory()->create();
    $admin = auditAdmin();
    Sanctum::actingAs($admin);

    $this->postJson('/api/librarians', [
        'library_id' => $library->id, 'last_name' => 'Rakoto', 'first_name' => 'Soa', 'gender' => 'feminin', 'cin_number' => '123456789012',
        'cin_issued_at' => '2025-01-15', 'email' => 'soa@example.com', 'phone' => '0340000000', 'address' => 'Mahajanga',
    ])->assertCreated();

    $log = lastAudit('creation_bibliothecaire');
    expect($log->user_id)->toBe($admin->id)->and($log->library_id)->toBe($library->id)->and($log->subject_label)->toContain('Rakoto');
});

// ---------- Service et API ----------

test('diff ignore les valeurs équivalentes et signale les vrais changements', function () {
    expect(ActivityLogService::diff(['a' => null, 'b' => 2020, 'c' => 'x', 'd' => ['u', 'v']], ['a' => '', 'b' => '2020', 'c' => 'y', 'd' => ['u', 'v']]))
        ->toBe(['c' => ['before' => 'x', 'after' => 'y']]);
});

test('l\'historique expose la bibliothèque, l\'élément et l\'avant/après, et reste réservé à l\'administrateur', function () {
    $library = Library::factory()->create(['name' => 'Bibliothèque Est']);
    $document = Document::factory()->create(['library_id' => $library->id]);
    $admin = auditAdmin();
    ActivityLogService::log($admin->id, 'modification_document', 'Titre', $document, ['title' => ['before' => 'A', 'after' => 'B']]);

    Sanctum::actingAs($admin);
    $entry = $this->getJson('/api/activity-logs?action=modification_document')->assertOk()->json('data.0');
    expect($entry['library']['name'])->toBe('Bibliothèque Est')->and($entry['subject_label'])->toBe($document->title)
        ->and($entry['changes'])->toBe(['title' => ['before' => 'A', 'after' => 'B']]);

    // Un bibliothécaire ne voit pas l'historique des autres.
    Sanctum::actingAs(auditLibrarian());
    expect($this->getJson('/api/activity-logs')->assertOk()->json('data'))->toBe([]);
});
