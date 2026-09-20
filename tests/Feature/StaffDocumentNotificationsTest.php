<?php

use App\Models\AppNotification;
use App\Models\Document;
use App\Models\Library;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

const STAFF_TYPES = ['document_ajoute', 'document_modifie', 'document_archive', 'document_supprime'];

function staffUsers(): object
{
    $a = Library::factory()->create(['name' => 'Bibliothèque A']);
    $b = Library::factory()->create(['name' => 'Bibliothèque B']);
    $make = fn (string $role, ?Library $lib, array $extra = []) => User::factory()->create(array_merge(
        ['role' => $role, 'is_active' => true, 'library_id' => $lib?->id], $extra));

    return (object) [
        'libA' => $a, 'libB' => $b,
        'admin1' => $make('administrateur', null, ['name' => 'Admin Un']),
        'admin2' => $make('administrateur', null, ['name' => 'Admin Deux']),
        'a1' => $make('bibliothecaire', $a, ['name' => 'Jean Dupont']),
        'a2' => $make('bibliothecaire', $a, ['name' => 'Marie Rasoa']),
        'a3' => $make('bibliothecaire', $a, ['is_active' => false]),
        'b1' => $make('bibliothecaire', $b, ['name' => 'Paul Andria']),
        'student' => $make('etudiant', $a),
    ];
}

function received(User $user, ?string $type = null)
{
    return AppNotification::where('user_id', $user->id)
        ->when($type, fn ($q) => $q->where('type', $type), fn ($q) => $q->whereIn('type', STAFF_TYPES))
        ->get();
}

function newDocumentPayload(Library $library): array
{
    return [
        'title' => 'Algorithmique avancée', 'type' => 'Livre', 'category' => 'Informatique', 'library_id' => $library->id,
        'language' => 'Français', 'access_level' => 'authentifie', 'file' => UploadedFile::fake()->create('a.pdf', 50, 'application/pdf'),
    ];
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();
});

test('un bibliothécaire qui ajoute un document notifie les administrateurs et les collègues de la même bibliothèque', function () {
    $this->travelTo('2026-04-12 11:35:00'); // UTC → 14:35 à Madagascar
    $u = staffUsers();
    Sanctum::actingAs($u->a1);

    $id = $this->post('/api/documents', newDocumentPayload($u->libA), ['Accept' => 'application/json'])->assertCreated()->json('id');

    foreach ([$u->admin1, $u->admin2, $u->a2] as $recipient) {
        $notes = received($recipient, 'document_ajoute');
        expect($notes)->toHaveCount(1);
        expect($notes[0]->title)->toBe('Nouveau document ajouté')
            ->and($notes[0]->message)->toBe('« Algorithmique avancée » a été ajouté par Jean Dupont (Bibliothèque A) le 12/04/2026 à 14:35.')
            ->and($notes[0]->related_id)->toBe($id)->and($notes[0]->related_type)->toBe(Document::class)
            ->and($notes[0]->read_at)->toBeNull();
    }
    // Ni l'auteur, ni une autre bibliothèque, ni un compte inactif, ni un étudiant.
    foreach ([$u->a1, $u->b1, $u->a3, $u->student] as $excluded) {
        expect(received($excluded))->toHaveCount(0);
    }
});

test('la modification par un bibliothécaire notifie avec les champs modifiés, et pas sans changement réel', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['title' => 'Ancien', 'library_id' => $u->libA->id, 'language' => 'fr']);
    Sanctum::actingAs($u->a1);

    $this->post("/api/documents/{$document->id}", ['title' => 'Ancien', 'language' => 'fr'], ['Accept' => 'application/json'])->assertOk();
    expect(AppNotification::whereIn('type', STAFF_TYPES)->count())->toBe(0);

    $this->post("/api/documents/{$document->id}", ['title' => 'Nouveau titre', 'niveau' => 'L2'], ['Accept' => 'application/json'])->assertOk();

    expect(received($u->admin1, 'document_modifie'))->toHaveCount(1)
        ->and(received($u->a2, 'document_modifie')[0]->message)->toContain('modifié par Jean Dupont')->toContain('Champs modifiés : titre, niveau.')
        ->and(received($u->a1))->toHaveCount(0)->and(received($u->b1))->toHaveCount(0)
        ->and(AppNotification::where('type', 'document_modifie')->count())->toBe(3); // admin1, admin2, a2 : aucun doublon
});

test('l\'archivage par un bibliothécaire notifie une seule fois, même si on archive deux fois', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['status' => 'publie', 'library_id' => $u->libA->id]);
    Sanctum::actingAs($u->a1);

    $this->postJson("/api/documents/{$document->id}/archive")->assertOk();
    $this->postJson("/api/documents/{$document->id}/archive")->assertOk();

    expect(AppNotification::where('type', 'document_archive')->count())->toBe(3)
        ->and(received($u->admin2, 'document_archive')[0]->title)->toBe('Document archivé');
});

test('un administrateur qui modifie, archive ou supprime notifie uniquement les bibliothécaires de la même bibliothèque', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['status' => 'publie', 'library_id' => $u->libA->id, 'title' => 'Droit civil']);
    Sanctum::actingAs($u->admin1);

    $this->post("/api/documents/{$document->id}", ['title' => 'Droit civil 2'], ['Accept' => 'application/json'])->assertOk();
    $this->postJson("/api/documents/{$document->id}/archive")->assertOk();
    $this->deleteJson("/api/documents/{$document->id}")->assertOk();

    foreach (['document_modifie', 'document_archive', 'document_supprime'] as $type) {
        expect(received($u->a1, $type))->toHaveCount(1)->and(received($u->a2, $type))->toHaveCount(1);
        foreach ([$u->admin1, $u->admin2, $u->b1, $u->a3, $u->student] as $excluded) {
            expect(received($excluded, $type))->toHaveCount(0);
        }
    }
    expect(received($u->a1, 'document_supprime')[0]->message)->toStartWith('« Droit civil 2 » a été supprimé par Admin Un (Bibliothèque A) le ');
});

test('les actions hors périmètre ne créent aucune notification de personnel', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['status' => 'brouillon', 'library_id' => $u->libA->id]);

    // Un administrateur qui ajoute ou publie : pas de notification « personnel » (la publication garde sa diffusion existante).
    Sanctum::actingAs($u->admin1);
    $this->post('/api/documents', newDocumentPayload($u->libA), ['Accept' => 'application/json'])->assertCreated();
    $this->postJson("/api/documents/{$document->id}/publish")->assertOk();

    expect(AppNotification::whereIn('type', STAFF_TYPES)->count())->toBe(0)
        // Diffusion existante inchangée : tous les utilisateurs actifs sauf l'auteur, une fois chacun.
        ->and(AppNotification::where('type', 'document_publie')->count())->toBe(User::where('is_active', true)->whereKeyNot($u->admin1->id)->count())
        ->and(received($u->a2, 'document_publie'))->toHaveCount(1);

    // Un bibliothécaire autorisé à supprimer : pas dans le périmètre demandé.
    $u->a1->permissions()->attach(Permission::where('name', 'supprimer_document')->firstOrFail()->id);
    Sanctum::actingAs($u->a1);
    $this->deleteJson("/api/documents/{$document->id}")->assertOk();
    expect(AppNotification::where('type', 'document_supprime')->count())->toBe(0);
});

test('une action refusée ou invalide ne notifie personne', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['library_id' => $u->libA->id]);

    Sanctum::actingAs($u->student);
    $this->postJson("/api/documents/{$document->id}/archive")->assertForbidden();
    Sanctum::actingAs($u->a1);
    $this->post("/api/documents/{$document->id}", ['title' => ''], ['Accept' => 'application/json'])->assertStatus(422);
    $this->post('/api/documents', ['title' => 'Incomplet'], ['Accept' => 'application/json'])->assertStatus(422);

    expect(AppNotification::whereIn('type', STAFF_TYPES)->count())->toBe(0);
});

test('un document déplacé prévient les bibliothécaires de l\'ancienne et de la nouvelle bibliothèque', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['library_id' => $u->libA->id]);
    Sanctum::actingAs($u->admin1);

    $this->post("/api/documents/{$document->id}", ['library_id' => $u->libB->id], ['Accept' => 'application/json'])->assertOk();

    expect(received($u->a1, 'document_modifie'))->toHaveCount(1)
        ->and(received($u->b1, 'document_modifie'))->toHaveCount(1)
        ->and(received($u->b1, 'document_modifie')[0]->message)->toContain('Bibliothèque A, Bibliothèque B')->toContain('Champs modifiés : bibliothèque.');
});

test('le clic sur une notification ouvre le bon élément selon le rôle et l\'état du document', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['status' => 'brouillon', 'library_id' => $u->libA->id]);
    Sanctum::actingAs($u->a1);
    $this->post("/api/documents/{$document->id}", ['title' => 'Modifié'], ['Accept' => 'application/json'])->assertOk();

    $url = fn (User $user, string $type) => (function () use ($user, $type) {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/notifications')->assertOk()->json('data'))->firstWhere('type', $type)['related_url'] ?? null;
    })();

    // Document existant (même brouillon) : page de modification de l'espace du destinataire.
    expect($url($u->a2, 'document_modifie'))->toBe("/bibliothecaire/documents/{$document->id}/modifier")
        ->and($url($u->admin1, 'document_modifie'))->toBe("/administrateur/documents/{$document->id}/modifier");

    // Supprimé (Corbeille), puis supprimé définitivement.
    $document->delete();
    expect($url($u->admin1, 'document_modifie'))->toBe('/administrateur/corbeille')
        ->and($url($u->a2, 'document_modifie'))->toBe('/bibliothecaire/documents'); // sans permission « voir_corbeille »
    $u->a2->permissions()->attach(Permission::where('name', 'voir_corbeille')->firstOrFail()->id);
    expect($url($u->a2, 'document_modifie'))->toBe('/bibliothecaire/corbeille');
    $document->forceDelete();
    expect($url($u->admin1, 'document_modifie'))->toBe('/administrateur/documents');
});

test('marquer comme lue / non lue et les compteurs continuent de fonctionner sur ces notifications', function () {
    $u = staffUsers();
    $document = Document::factory()->create(['library_id' => $u->libA->id]);
    Sanctum::actingAs($u->a1);
    $this->postJson("/api/documents/{$document->id}/archive")->assertOk();
    $this->deleteJson("/api/documents/{$document->id}")->assertForbidden(); // permission manquante : aucune 2e notification

    Sanctum::actingAs($u->a2);
    $this->getJson('/api/notifications/unread-count')->assertOk()->assertJsonPath('count', 1);
    $id = received($u->a2, 'document_archive')[0]->id;

    $this->postJson("/api/notifications/{$id}/read")->assertOk();
    $this->getJson('/api/notifications/unread-count')->assertJsonPath('count', 0);
    $this->postJson("/api/notifications/{$id}/unread")->assertOk();
    $this->getJson('/api/notifications/unread-count')->assertJsonPath('count', 1);
    $this->postJson('/api/notifications/read-all')->assertOk();
    $this->getJson('/api/notifications/unread-count')->assertJsonPath('count', 0);

    // On ne peut pas agir sur la notification d'un autre.
    Sanctum::actingAs($u->b1);
    $this->postJson("/api/notifications/{$id}/read")->assertForbidden();
});
