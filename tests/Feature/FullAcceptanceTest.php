<?php

// Phase 10 — scénarios de recette de bout en bout qui complètent les tests par module :
// cycle de vie d'un document (totaux, recherche, audit horodaté, notifications) et
// questions représentatives de l'assistant du bibliothécaire.

use App\Models\ActivityLog;
use App\Models\AppNotification;
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

function p10Librarian(Library $library, array $permissions = [], array $extra = []): User
{
    $user = User::factory()->create(array_merge(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id], $extra));
    foreach ($permissions as $name) {
        $user->permissions()->attach(Permission::where('name', $name)->firstOrFail()->id);
    }

    return $user;
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();
});

test('cycle de vie complet : ajout, recherche, modification, publication, archivage, suppression — totaux, audit horodaté et responsable', function () {
    $library = Library::factory()->create(['name' => 'Bibliothèque Centrale']);
    $jean = p10Librarian($library, ['publier_document', 'supprimer_document', 'voir_corbeille'], ['name' => 'Jean Dupont']);
    Sanctum::actingAs($jean);
    $counts = fn () => $this->getJson('/api/documents-manage')->assertOk()->json('counts');

    // Ajout (brouillon).
    $this->travelTo('2026-04-12 08:00:00');
    $id = $this->post('/api/documents', [
        'title' => 'Algorithmique avancée', 'type' => 'Livre', 'category' => 'Informatique', 'library_id' => $library->id,
        'language' => 'Français', 'access_level' => 'authentifie', 'file' => UploadedFile::fake()->create('a.pdf', 50, 'application/pdf'),
    ], ['Accept' => 'application/json'])->assertCreated()->json('id');
    expect($counts())->toMatchArray(['all' => 1, 'brouillon' => 1, 'publie' => 0, 'archive' => 0]);

    // Recherche : trouvée par un fragment, insensible à la casse ; absente pour un autre terme.
    expect(collect($this->getJson('/api/documents-manage?q=ALGO')->json('data'))->pluck('id')->all())->toBe([$id])
        ->and($this->getJson('/api/documents-manage?q=botanique')->json('total'))->toBe(0);

    // Modification.
    $this->travelTo('2026-04-12 09:00:00');
    $this->post("/api/documents/{$id}", ['title' => 'Algorithmique avancée (2e éd.)'], ['Accept' => 'application/json'])->assertOk();

    // Publication, archivage, suppression : chaque étape déplace le document d'un total à l'autre.
    $this->travelTo('2026-04-12 10:00:00');
    $this->postJson("/api/documents/{$id}/publish")->assertOk();
    expect($counts())->toMatchArray(['all' => 1, 'brouillon' => 0, 'publie' => 1, 'archive' => 0]);

    $this->travelTo('2026-04-12 11:00:00');
    $this->postJson("/api/documents/{$id}/archive")->assertOk();
    expect($counts())->toMatchArray(['all' => 1, 'publie' => 0, 'archive' => 1]);

    $this->travelTo('2026-04-12 12:00:00');
    $this->deleteJson("/api/documents/{$id}")->assertOk();
    expect($counts())->toMatchArray(['all' => 0, 'brouillon' => 0, 'publie' => 0, 'archive' => 0])
        ->and(collect($this->getJson('/api/trash')->json('documents'))->pluck('id')->all())->toBe([$id]);

    // Audit : une entrée par action, dans l'ordre, avec l'heure exacte, le responsable et la bibliothèque.
    $expected = [
        'creation_document' => '2026-04-12 08:00:00', 'modification_document' => '2026-04-12 09:00:00',
        'publication_document' => '2026-04-12 10:00:00', 'archivage_document' => '2026-04-12 11:00:00',
        'suppression_document' => '2026-04-12 12:00:00',
    ];
    $logs = ActivityLog::where('subject_id', $id)->orderBy('id')->get();
    expect($logs->pluck('action')->all())->toBe(array_keys($expected));
    foreach ($logs as $log) {
        expect($log->created_at->format('Y-m-d H:i:s'))->toBe($expected[$log->action], $log->action)
            ->and($log->user_id)->toBe($jean->id)
            ->and($log->library_id)->toBe($library->id);
    }
});

test('une publication par un bibliothécaire prévient les autres utilisateurs actifs une seule fois, jamais son auteur', function () {
    $library = Library::factory()->create();
    $author = p10Librarian($library, ['publier_document']);
    $colleague = p10Librarian($library);
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $library->id]);
    $inactive = User::factory()->create(['role' => 'etudiant', 'is_active' => false]);
    $document = Document::factory()->create(['status' => 'brouillon', 'library_id' => $library->id, 'title' => 'À diffuser']);
    Sanctum::actingAs($author);

    $this->postJson("/api/documents/{$document->id}/publish")->assertOk();
    $this->postJson("/api/documents/{$document->id}/publish")->assertOk(); // republier ne doit pas casser l'existant

    $notes = fn (User $u) => AppNotification::where('user_id', $u->id)->where('type', 'document_publie')->count();
    expect($notes($author))->toBe(0)->and($notes($inactive))->toBe(0);
    foreach ([$colleague, $admin, $student] as $recipient) {
        expect($notes($recipient))->toBeGreaterThanOrEqual(1);
    }
    // Aucune notification « personnel » (ajout, modification, archivage, suppression) n'est créée par une publication.
    expect(AppNotification::whereIn('type', ['document_ajoute', 'document_modifie', 'document_archive', 'document_supprime'])->count())->toBe(0);
});

test('un bibliothécaire qui supprime un document est journalisé et sa suppression n\'est notifiée à personne d\'autre que prévu', function () {
    $library = Library::factory()->create();
    $librarian = p10Librarian($library, ['supprimer_document']);
    $document = Document::factory()->create(['library_id' => $library->id, 'title' => 'À supprimer']);
    Sanctum::actingAs($librarian);

    $this->deleteJson("/api/documents/{$document->id}")->assertOk();

    expect(ActivityLog::where('action', 'suppression_document')->where('subject_id', $document->id)->where('user_id', $librarian->id)->count())->toBe(1)
        ->and(Document::find($document->id))->toBeNull()
        ->and(Document::withTrashed()->find($document->id)->trashed())->toBeTrue()
        ->and(AppNotification::where('user_id', $librarian->id)->whereIn('type', ['document_supprime', 'document_archive', 'document_modifie', 'document_ajoute'])->count())->toBe(0);
});

// ---------- Assistant du bibliothécaire : questions représentatives, réponses issues des données Laravel ----------

function p10Call(string $name, array $args = []): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['functionCall' => ['name' => $name, 'args' => $args]]]]]]];
}

function p10Text(string $text): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['text' => $text]]]]]];
}

test('les questions représentatives du bibliothécaire sont résolues avec les seules données de sa bibliothèque', function () {
    config(['services.gemini.key' => 'test-key']);
    $a = Library::factory()->create(['name' => 'Bibliothèque Centrale']);
    $b = Library::factory()->create(['name' => 'Bibliothèque Nord']);
    $info = Category::factory()->create(['name' => 'Informatique']);
    $jean = p10Librarian($a, [], ['name' => 'Jean Dupont']);
    $paul = p10Librarian($b, [], ['name' => 'Paul Nord']);

    $algo = Document::factory()->create(['title' => 'Algorithmique avancée', 'type' => 'livre', 'category_id' => $info->id, 'library_id' => $a->id, 'status' => 'publie']);
    Document::factory()->create(['title' => 'Brouillon A', 'type' => 'memoire', 'library_id' => $a->id, 'status' => 'brouillon']);
    $nord = Document::factory()->create(['title' => 'Manuel du Nord', 'type' => 'livre', 'category_id' => $info->id, 'library_id' => $b->id, 'status' => 'publie']);
    Document::factory()->create(['title' => 'Brouillon Nord', 'library_id' => $b->id, 'status' => 'brouillon']);

    $this->travelTo('2026-09-20 09:00:00'); // 12:00 à Madagascar
    ActivityLogService::log($jean->id, 'publication_document', $algo->title, $algo, ['status' => ['before' => 'brouillon', 'after' => 'publie']]);
    ActivityLogService::log($paul->id, 'modification_document', $nord->title, $nord, ['title' => ['before' => 'x', 'after' => 'Manuel du Nord']]);

    $cases = [
        // Statistiques
        ['Combien de documents avons-nous ?', 'compter_documents', [], ['"total":2', 'Bibliothèque « Bibliothèque Centrale »'], ['Nord']],
        ['Combien de brouillons ?', 'compter_documents', ['statut' => 'brouillon'], ['"total":1'], ['Brouillon Nord']],
        ['Répartition par statut ?', 'repartition_documents', ['par' => 'statut'], ['"libelle":"brouillon","nombre":1', '"libelle":"publie","nombre":1'], ['Nord']],
        // Recherche
        ["Avons-nous des livres d'informatique ?", 'rechercher_documents', ['type' => 'livre', 'categorie' => 'Informatique'], ['Algorithmique avancée', '"total":1'], ['Manuel du Nord']],
        // Historique
        ['Qui a publié Algorithmique ?', 'historique_document', ['titre' => 'Algorithmique', 'action' => 'publication_document'], ['Jean Dupont', '2026-09-20', 'Document publié'], []],
        ["Quelles actions ont été faites aujourd'hui ?", 'rechercher_actions', ['date' => '2026-09-20'], ['Jean Dupont', 'Algorithmique avancée'], ['Paul Nord', 'Manuel du Nord']],
    ];

    Sanctum::actingAs($jean);
    foreach ($cases as [$question, $tool, $args, $present, $absent]) {
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(p10Call($tool, $args))->push(p10Text('Réponse.'))]);

        $this->postJson('/api/assistant/librarian', ['question' => $question])->assertOk()->assertJson(['ok' => true]);

        $sent = json_encode(Http::recorded()[1][0]->data()['contents'][2], JSON_UNESCAPED_UNICODE);
        expect($sent)->toContain(...$present);
        foreach ($absent as $forbidden) {
            // Le nom d'une autre bibliothèque ne doit jamais figurer dans les données transmises au modèle.
            expect($sent)->not->toContain($forbidden);
        }
    }

    // Refus d'accès à une autre bibliothèque : aucun chiffre ni nom.
    Http::swap(new \Illuminate\Http\Client\Factory());
    Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(p10Call('compter_documents', ['bibliotheque' => 'Nord']))->push(p10Text('Hors périmètre.'))]);
    $response = $this->postJson('/api/assistant/librarian', ['question' => 'Combien de documents à Nord ?'])->assertOk();
    expect($response->json('sources.0.hors_perimetre'))->toBeTrue()
        ->and(json_encode(Http::recorded()[1][0]->data()['contents'][2], JSON_UNESCAPED_UNICODE))->not->toContain('Manuel du Nord')->not->toContain('"total":2');
});
