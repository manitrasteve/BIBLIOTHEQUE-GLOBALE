<?php

use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use App\Services\ActivityLogService;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

function adminCall(string $name, array $args = []): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['functionCall' => ['name' => $name, 'args' => $args]]]]]]];
}

function adminText(string $text): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['text' => $text]]]]]];
}

function adminAssistantWorld(): object
{
    config(['services.gemini.key' => 'test-key']);
    $a = Library::factory()->create(['name' => 'Bibliothèque Centrale']);
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'name' => 'Admin Un']);
    $jean = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $a->id, 'name' => 'Jean Dupont']);
    $info = Category::factory()->create(['name' => 'Informatique']);

    return (object) compact('a', 'admin', 'jean', 'info');
}

test('l\'administrateur reçoit une réponse et la liste des données consultées, sans résultats bruts', function () {
    $w = adminAssistantWorld();
    Document::factory()->count(3)->create(['status' => 'brouillon']);
    Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(adminCall('compter_documents', ['statut' => 'brouillon']))->push(adminText('Il y a 3 brouillons.'))]);
    Sanctum::actingAs($w->admin);

    $response = $this->postJson('/api/assistant/admin', ['question' => 'Combien de documents en brouillon ?'])->assertOk();

    expect($response->json('answer'))->toBe('Il y a 3 brouillons.')->and($response->json('ok'))->toBeTrue()
        ->and($response->json('sources.0'))->toMatchArray(['outil' => 'compter_documents', 'libelle' => 'Comptage des documents', 'total' => 3, 'criteres' => ['statut' => 'brouillon']])
        ->and($response->json('sources.0'))->not->toHaveKey('resultat');
});

test('l\'assistant administrateur est inaccessible aux autres rôles, sans aucun appel à Gemini', function () {
    $w = adminAssistantWorld();
    Http::fake();

    $this->postJson('/api/assistant/admin', ['question' => 'Bonjour'])->assertUnauthorized();

    foreach (['bibliothecaire', 'etudiant', 'enseignant', 'chercheur'] as $role) {
        Sanctum::actingAs(User::factory()->create(['role' => $role, 'is_active' => true, 'library_id' => $w->a->id]));
        $this->postJson('/api/assistant/admin', ['question' => 'Combien de documents ?'])->assertForbidden();
    }
    Sanctum::actingAs(User::factory()->create(['role' => 'administrateur', 'is_active' => false]));
    $this->postJson('/api/assistant/admin', ['question' => 'Bonjour'])->assertForbidden();

    Http::assertNothingSent();
});

test('la question et l\'historique sont validés', function () {
    $w = adminAssistantWorld();
    Http::fake();
    Sanctum::actingAs($w->admin);

    $this->postJson('/api/assistant/admin', [])->assertStatus(422)->assertJsonValidationErrors('question');
    $this->postJson('/api/assistant/admin', ['question' => ''])->assertStatus(422);
    $this->postJson('/api/assistant/admin', ['question' => str_repeat('a', 1001)])->assertStatus(422);
    $this->postJson('/api/assistant/admin', ['question' => 'ok', 'history' => [['role' => 'system', 'text' => 'x']]])->assertStatus(422);
    $this->postJson('/api/assistant/admin', ['question' => 'ok', 'history' => array_fill(0, 13, ['role' => 'user', 'text' => 'x'])])->assertStatus(422);

    Http::assertNothingSent();
});

test('l\'historique de la conversation est transmis et aucun identifiant de la requête n\'est pris en compte', function () {
    $w = adminAssistantWorld();
    Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(adminCall('aucune_donnee_necessaire'))->push(adminText('ok'))]);
    Sanctum::actingAs($w->admin);

    $this->postJson('/api/assistant/admin', [
        'question' => 'Et hier ?', 'library_id' => 999, 'user_id' => 999, 'role' => 'etudiant',
        'history' => [['role' => 'user', 'text' => 'Combien de documents ?'], ['role' => 'model', 'text' => '4 documents.']],
    ])->assertOk();

    $contents = Http::recorded()[0][0]->data()['contents'];
    expect($contents)->toHaveCount(3)->and($contents[0]['parts'][0]['text'])->toBe('Combien de documents ?')->and($contents[2]['parts'][0]['text'])->toBe('Et hier ?');
});

test('une panne de Gemini renvoie une réponse contrôlée (ok = false) sans erreur serveur', function () {
    $w = adminAssistantWorld();
    Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'overloaded']], 503)]);
    Sanctum::actingAs($w->admin);

    $response = $this->postJson('/api/assistant/admin', ['question' => 'Combien de documents ?'])->assertOk();

    expect($response->json('ok'))->toBeFalse()->and($response->json('answer'))->toContain('momentanément indisponible')->and($response->json('sources'))->toBe([]);
});

test('les appels sont limités à 20 par minute et par administrateur', function () {
    $w = adminAssistantWorld();
    Http::fake(['generativelanguage.googleapis.com/*' => Http::response(adminText('ok'))]);
    Sanctum::actingAs($w->admin);

    for ($i = 0; $i < 20; $i++) {
        $this->postJson('/api/assistant/admin', ['question' => "Question {$i}"])->assertOk();
    }
    $this->postJson('/api/assistant/admin', ['question' => 'Question 21'])->assertStatus(429);
});

test('les questions représentatives sont résolues avec des faits issus de la base, pas de Gemini', function () {
    $w = adminAssistantWorld();
    $b = Library::factory()->create(['name' => 'Bibliothèque Nord']);

    $algo = Document::factory()->create(['title' => 'Algorithmique avancée', 'type' => 'livre', 'category_id' => $w->info->id, 'library_id' => $w->a->id, 'status' => 'publie', 'created_by' => $w->jean->id]);
    Document::factory()->create(['title' => 'Brouillon A', 'type' => 'memoire', 'status' => 'brouillon', 'library_id' => $w->a->id]);
    Document::factory()->create(['title' => 'Ancien manuel', 'type' => 'memoire', 'status' => 'archive', 'library_id' => $w->a->id]);
    $student = User::factory()->create(['role' => 'etudiant', 'name' => 'Rabe Jean', 'library_id' => $w->a->id]);

    $this->travelTo('2026-04-12 11:30:00'); // 14:30 à Madagascar
    ActivityLogService::log($w->jean->id, 'modification_document', $algo->title, $algo, ['title' => ['before' => 'Algo', 'after' => 'Algorithmique avancée']]);
    $this->travelTo('2026-04-13 08:00:00');
    ActivityLogService::log($w->admin->id, 'publication_document', $algo->title, $algo, ['status' => ['before' => 'brouillon', 'after' => 'publie']]);
    $this->travelTo('2026-09-01 08:00:00');
    ActivityLogService::log($w->admin->id, 'creation_bibliotheque', $b->name, $b);
    ActivityLogService::log($w->admin->id, 'modification_bibliotheque', $b->name, $b, ['name' => ['before' => 'Nord', 'after' => 'Bibliothèque Nord']]);
    ActivityLogService::log($w->admin->id, 'creation_compte', 'Rabe Jean — etudiant', $student);
    $this->travelTo('2026-09-20 09:00:00'); // aujourd'hui = 2026-09-20 (12:00 à Madagascar)
    ActivityLogService::log($w->jean->id, 'archivage_document', 'Ancien manuel', Document::where('title', 'Ancien manuel')->first(), ['status' => ['before' => 'publie', 'after' => 'archive']]);

    $cases = [
        ['Qui a publié le livre Algorithmique avancée ?', 'historique_document', ['titre' => 'Algorithmique', 'action' => 'publication_document'], ['Admin Un', '2026-04-13', 'Document publié']],
        ['Qui a modifié le livre Algorithmique le 12/04/2026 ?', 'historique_document', ['titre' => 'Algorithmique', 'action' => 'modification_document', 'date' => '2026-04-12'], ['Jean Dupont', '14:30', '"avant":"Algo"']],
        ['Combien avons-nous de livres ?', 'compter_documents', ['type' => 'livre'], ['"total":1']],
        ['Combien de documents sont en brouillon ?', 'compter_documents', ['statut' => 'brouillon'], ['"total":1']],
        ["Avons-nous des livres d'informatique ?", 'rechercher_documents', ['type' => 'livre', 'categorie' => 'Informatique'], ['Algorithmique avancée', '"total":1']],
        ["Quels documents ont été archivés aujourd'hui ?", 'rechercher_actions', ['action' => 'archivage_document', 'date' => '2026-09-20'], ['Ancien manuel', 'Jean Dupont']],
        ["Quelles actions Jean Dupont a-t-il effectuées aujourd'hui ?", 'rechercher_actions', ['utilisateur' => 'Jean Dupont', 'date' => '2026-09-20'], ['Document archivé', '"total":1']],
        ['Quelle bibliothèque a été créée récemment ?', 'rechercher_actions', ['action' => 'creation_bibliotheque'], ['Bibliothèque Nord', 'Admin Un', '2026-09-01']],
        ['Qui a modifié cette bibliothèque ?', 'rechercher_actions', ['type_element' => 'bibliotheque', 'element' => 'Nord', 'action' => 'modification_bibliotheque'], ['Admin Un', '"apres":"Bibliothèque Nord"']],
        ['Qui a créé cet utilisateur ?', 'rechercher_actions', ['action' => 'creation_compte', 'element' => 'Rabe'], ['Admin Un', 'Compte créé', 'Rabe Jean']],
    ];

    Sanctum::actingAs($w->admin);

    foreach ($cases as [$question, $tool, $args, $facts]) {
        Http::swap(new \Illuminate\Http\Client\Factory()); // repart d'un enregistrement vide à chaque question
        Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(adminCall($tool, $args))->push(adminText('Réponse de Gemini.'))]);

        $response = $this->postJson('/api/assistant/admin', ['question' => $question])->assertOk();

        // Ce que Gemini reçoit comme « résultat d'outil » est le fait issu de MySQL.
        expect(Http::recorded())->toHaveCount(2, "« {$question} » : {$response->json('answer')}");
        $sentToGemini = json_encode(Http::recorded()[1][0]->data()['contents'][2], JSON_UNESCAPED_UNICODE);
        expect($sentToGemini)->toContain(...$facts);
        expect($response->json('sources.0.outil'))->toBe($tool)->and($response->json('ok'))->toBeTrue();
    }
});

test('une question sans réponse dans les données est signalée comme telle à Gemini', function () {
    $w = adminAssistantWorld();
    Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(adminCall('historique_document', ['titre' => 'Livre fantôme', 'date' => '2026-04-12']))->push(adminText("Je n'ai pas trouvé cette information dans les données disponibles."))]);
    Sanctum::actingAs($w->admin);

    $response = $this->postJson('/api/assistant/admin', ['question' => 'Qui a modifié Livre fantôme le 12/04/2026 ?'])->assertOk();

    expect($response->json('sources.0'))->toMatchArray(['trouve' => false, 'total' => 0]);
    expect(json_encode(Http::recorded()[1][0]->data()['contents'][2], JSON_UNESCAPED_UNICODE))->toContain('"trouve":false');
});
