<?php

use App\Models\ActivityLog;
use App\Models\Author;
use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\Assistant\AssistantAccessException;
use App\Services\Assistant\AssistantScope;
use App\Services\Assistant\AssistantTools;

function toolsWorld(): object
{
    $a = Library::factory()->create(['name' => 'Bibliothèque Centrale']);
    $b = Library::factory()->create(['name' => 'Bibliothèque Nord']);
    $info = Category::factory()->create(['name' => 'Informatique']);
    $droit = Category::factory()->create(['name' => 'Droit']);
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'name' => 'Admin Un']);
    $librarianA = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $a->id, 'name' => 'Jean Dupont']);
    $librarianB = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $b->id, 'name' => 'Paul Andria']);

    $mk = fn (Library $lib, array $attrs = []) => Document::factory()->create(array_merge(['library_id' => $lib->id, 'category_id' => $info->id, 'status' => 'publie', 'created_by' => $librarianA->id], $attrs));
    $algo = $mk($a, ['title' => 'Algorithmique avancée', 'type' => 'livre']);
    $mk($a, ['title' => 'Structures de données', 'type' => 'Livre', 'status' => 'brouillon']);
    $mk($a, ['title' => 'Droit civil', 'type' => 'memoire', 'category_id' => $droit->id, 'status' => 'archive']);
    $mk($b, ['title' => 'Algèbre linéaire', 'type' => 'Mémoire', 'created_by' => $librarianB->id]);
    $mk($b, ['title' => 'Physique nucléaire secrète', 'type' => 'these', 'status' => 'brouillon']);
    $mk($a, ['title' => 'Supprimé', 'status' => 'publie'])->delete();

    return (object) compact('a', 'b', 'admin', 'librarianA', 'librarianB', 'algo', 'info', 'droit');
}

function toolsFor(User $user): AssistantTools
{
    return new AssistantTools(AssistantScope::for($user));
}

// ---------- Périmètre ----------

test('le périmètre vient de l\'utilisateur authentifié et refuse les autres profils', function () {
    $w = toolsWorld();

    expect(AssistantScope::for($w->admin)->libraryId)->toBeNull()
        ->and(AssistantScope::for($w->librarianA)->libraryId)->toBe($w->a->id);

    foreach ([
        User::factory()->create(['role' => 'etudiant', 'is_active' => true]),
        User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => null]),
        User::factory()->create(['role' => 'bibliothecaire', 'is_active' => false, 'library_id' => $w->a->id]),
    ] as $denied) {
        expect(fn () => AssistantScope::for($denied))->toThrow(AssistantAccessException::class);
    }
});

test('un bibliothécaire ne peut jamais lire une autre bibliothèque, quels que soient les critères envoyés par Gemini', function () {
    $w = toolsWorld();
    $tools = toolsFor($w->librarianA);

    // Sa propre bibliothèque : 3 documents (corbeille exclue), 2 publié ... jamais ceux de « Nord ».
    $own = $tools->run('compter_documents', []);
    expect($own['total'])->toBe(3)->and($own['par_statut'])->toBe(['brouillon' => 1, 'publie' => 1, 'archive' => 1]);

    // Nom d'une autre bibliothèque : aucune donnée, message de périmètre.
    foreach (['compter_documents', 'rechercher_documents', 'repartition_documents', 'rechercher_actions'] as $tool) {
        $result = $tools->run($tool, ['bibliotheque' => 'Bibliothèque Nord', 'par' => 'type']);
        expect($result['hors_perimetre'])->toBeTrue()->and($result['trouve'])->toBeFalse()->and($result)->not->toHaveKey('total');
    }
    expect(json_encode($tools->run('rechercher_bibliotheques', ['nom' => 'Nord'])))->not->toContain('Nord"')->and($tools->run('rechercher_bibliotheques', ['nom' => 'Nord'])['hors_perimetre'])->toBeTrue();

    // Identifiants injectés : ignorés.
    $injected = $tools->run('compter_documents', ['library_id' => $w->b->id, 'bibliotheque_id' => $w->b->id, 'user_id' => $w->admin->id]);
    expect($injected['total'])->toBe(3);
    $search = $tools->run('rechercher_documents', ['library_id' => $w->b->id]);
    expect(collect($search['documents'])->pluck('bibliotheque')->unique()->all())->toBe(['Bibliothèque Centrale']);

    // Sa propre bibliothèque nommée : autorisée (même partiellement, sans accents).
    expect($tools->run('compter_documents', ['bibliotheque' => 'centrale'])['total'])->toBe(3);
    // Une recherche ciblant un document de l'autre bibliothèque ne le trouve pas.
    expect($tools->run('rechercher_documents', ['titre' => 'nucléaire'])['trouve'])->toBeFalse();
    expect($tools->run('historique_document', ['titre' => 'nucléaire'])['trouve'])->toBeFalse();
});

test('l\'administrateur voit toutes les bibliothèques et peut cibler l\'une d\'elles', function () {
    $w = toolsWorld();
    $tools = toolsFor($w->admin);

    expect($tools->run('compter_documents', [])['total'])->toBe(5)
        ->and($tools->run('compter_documents', ['bibliotheque' => 'Nord'])['total'])->toBe(2)
        ->and($tools->run('compter_documents', ['bibliotheque' => 'Inconnue'])['trouve'])->toBeFalse()
        ->and($tools->run('rechercher_bibliotheques', [])['total'])->toBe(2);
});

// ---------- Comptages ----------

test('les comptages par statut, type et catégorie viennent de la base et fusionnent les variantes de type', function () {
    $w = toolsWorld();
    $tools = toolsFor($w->admin);

    expect($tools->run('compter_documents', ['statut' => 'publie'])['total'])->toBe(2)
        ->and($tools->run('compter_documents', ['statut' => 'brouillon'])['total'])->toBe(2)
        ->and($tools->run('compter_documents', ['categorie' => 'informatique'])['total'])->toBe(4)
        ->and($tools->run('compter_documents', ['type' => 'livre'])['total'])->toBe(2);

    $types = collect($tools->run('repartition_documents', ['par' => 'type'])['repartition'])->pluck('nombre', 'libelle')->all();
    expect($types)->toBe(['Livre' => 2, 'Mémoire' => 2, 'Thèse' => 1]);

    $categories = collect($tools->run('repartition_documents', ['par' => 'categorie'])['repartition'])->pluck('nombre', 'libelle')->all();
    expect($categories)->toBe(['Informatique' => 4, 'Droit' => 1]);

    $libraries = collect($tools->run('repartition_documents', ['par' => 'bibliotheque'])['repartition'])->pluck('nombre', 'libelle')->all();
    expect($libraries)->toBe(['Bibliothèque Centrale' => 3, 'Bibliothèque Nord' => 2]);

    // Un bibliothécaire ne peut pas regrouper par bibliothèque.
    expect(toolsFor($w->librarianA)->run('repartition_documents', ['par' => 'bibliotheque'])['hors_perimetre'])->toBeTrue();
});

// ---------- Recherche de documents ----------

test('la recherche de documents filtre par titre, auteur, statut et jour (fuseau local) et borne les résultats', function () {
    $w = toolsWorld();
    $author = Author::factory()->create(['name' => 'Rakoto Jean']);
    $w->algo->authors()->attach($author->id);
    $w->algo->forceFill(['created_at' => '2026-04-12 22:30:00'])->save(); // UTC → 13/04 01:30 à Madagascar
    $tools = toolsFor($w->admin);

    $byTitle = $tools->run('rechercher_documents', ['titre' => 'ALGO']);
    // Recherche partielle et insensible à la casse : « ALGO » trouve « Algorithmique… » (pas « Algèbre… »).
    expect($byTitle['total'])->toBe(1)->and($byTitle['documents'][0]['titre'])->toBe('Algorithmique avancée');
    expect($tools->run('rechercher_documents', ['titre' => 'alg'])['total'])->toBe(2);
    expect($tools->run('rechercher_documents', ['titre' => 'algorithmique'])['documents'][0])->toMatchArray([
        'titre' => 'Algorithmique avancée', 'categorie' => 'Informatique', 'bibliotheque' => 'Bibliothèque Centrale', 'statut' => 'publie', 'ajoute_par' => 'Jean Dupont', 'ajoute_le' => '2026-04-13 01:30',
    ]);
    expect($tools->run('rechercher_documents', ['auteur' => 'rakoto'])['total'])->toBe(1)
        ->and($tools->run('rechercher_documents', ['statut' => 'archive', 'categorie' => 'Droit'])['total'])->toBe(1)
        // Le jour se calcule à l'heure de Madagascar, pas en UTC.
        ->and($tools->run('rechercher_documents', ['titre' => 'algorithmique', 'date' => '2026-04-13'])['total'])->toBe(1)
        ->and($tools->run('rechercher_documents', ['titre' => 'algorithmique', 'date' => '2026-04-12'])['trouve'])->toBeFalse()
        ->and($tools->run('rechercher_documents', ['titre' => 'algorithmique', 'date_debut' => '2026-04-01', 'date_fin' => '2026-04-30'])['total'])->toBe(1)
        ->and($tools->run('rechercher_documents', ['titre' => 'Supprimé'])['trouve'])->toBeFalse(); // corbeille exclue

    // Résultats bornés, mais le total réel est indiqué.
    Document::factory()->count(20)->create(['library_id' => $w->a->id, 'title' => 'Lot de test', 'status' => 'publie']);
    $lot = $tools->run('rechercher_documents', ['titre' => 'Lot de test']);
    expect($lot['total'])->toBe(20)->and($lot['affiches'])->toBe(15)->and($lot['documents'])->toHaveCount(15);
});

// ---------- Historique et journal d'audit ----------

test('l\'historique d\'un document indique qui, quoi, quand, dans quelle bibliothèque et les modifications', function () {
    $w = toolsWorld();
    $this->travelTo('2026-04-12 11:30:00'); // UTC → 14:30 à Madagascar
    ActivityLogService::log($w->librarianA->id, 'modification_document', $w->algo->title, $w->algo, ['title' => ['before' => 'Algo', 'after' => 'Algorithmique avancée']]);
    $this->travelTo('2026-04-13 08:00:00');
    ActivityLogService::log($w->admin->id, 'publication_document', $w->algo->title, $w->algo, ['status' => ['before' => 'brouillon', 'after' => 'publie']]);

    $result = toolsFor($w->admin)->run('historique_document', ['titre' => 'algorithmique']);

    expect($result['total'])->toBe(2)->and($result['plusieurs_elements_differents'])->toBeFalse();
    expect($result['actions'][0])->toMatchArray(['action' => 'Document publié', 'effectuee_par' => 'Admin Un', 'role_auteur' => 'administrateur', 'bibliotheque' => 'Bibliothèque Centrale', 'date' => '2026-04-13', 'heure' => '11:00'])
        ->and($result['actions'][1])->toMatchArray(['action' => 'Document modifié', 'effectuee_par' => 'Jean Dupont', 'date' => '2026-04-12', 'heure' => '14:30'])
        ->and($result['actions'][1]['modifications'])->toBe(['title' => ['avant' => 'Algo', 'apres' => 'Algorithmique avancée']]);

    // « Qui a modifié le livre X le 12/04/2026 ? »
    $onDay = toolsFor($w->admin)->run('historique_document', ['titre' => 'algorithmique', 'action' => 'modification_document', 'date' => '2026-04-12']);
    expect($onDay['total'])->toBe(1)->and($onDay['actions'][0]['effectuee_par'])->toBe('Jean Dupont');
    expect(toolsFor($w->admin)->run('historique_document', ['titre' => 'algorithmique', 'action' => 'modification_document', 'date' => '2026-04-11'])['trouve'])->toBeFalse();
});

test('l\'historique d\'un document supprimé définitivement reste consultable ; deux documents proches sont signalés', function () {
    $w = toolsWorld();
    $gone = Document::factory()->create(['library_id' => $w->a->id, 'title' => 'Ancien rapport']);
    ActivityLogService::log($w->admin->id, 'suppression_definitive_document', $gone->title, $gone);
    $gone->forceDelete();
    ActivityLogService::log($w->admin->id, 'creation_document', 'Rapport 2024', Document::factory()->create(['library_id' => $w->a->id, 'title' => 'Rapport 2024']));

    $tools = toolsFor($w->librarianA);
    expect($tools->run('historique_document', ['titre' => 'Ancien rapport'])['actions'][0])->toMatchArray(['action' => 'Document supprimé définitivement', 'element' => 'Ancien rapport'])
        ->and($tools->run('historique_document', ['titre' => 'rapport'])['plusieurs_elements_differents'])->toBeTrue();
});

test('les actions personnelles des membres et les actions réservées à l\'administrateur ne sont jamais exposées au bibliothécaire', function () {
    $w = toolsWorld();
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $w->a->id, 'name' => 'Etudiant Secret']);
    ActivityLogService::log($student->id, 'connexion', 'Connexion');
    ActivityLogService::log($student->id, 'consultation_document', $w->algo->title, $w->algo);
    ActivityLogService::log($student->id, 'question_ia', 'Question privée', $w->algo);
    ActivityLogService::log($w->admin->id, 'permissions_modifiees', 'Permissions de Jean', $w->librarianA);
    ActivityLogService::log($w->admin->id, 'vidage_corbeille', 'Corbeille vidée');
    ActivityLogService::log($w->admin->id, 'creation_compte', 'Nouveau compte', $student);

    $forLibrarian = toolsFor($w->librarianA)->run('rechercher_actions', []);
    expect(collect($forLibrarian['actions'])->pluck('action')->all())->toBe(['Compte créé']);
    expect(json_encode($forLibrarian))->not->toContain('Question privée')->not->toContain('Permissions');

    // Une action réservée à l'administrateur est refusée comme critère.
    expect(toolsFor($w->librarianA)->run('rechercher_actions', ['action' => 'permissions_modifiees'])['erreur'])->toContain('Valeur invalide');

    $forAdmin = collect(toolsFor($w->admin)->run('rechercher_actions', [])['actions'])->pluck('action')->all();
    expect($forAdmin)->toContain('Permissions modifiées')->toContain('Corbeille vidée')->toContain('Compte créé')
        ->not->toContain('Question à l\'IA')->and(collect($forAdmin)->contains(fn ($a) => str_contains($a, 'Connexion')))->toBeFalse();
});

test('les actions d\'un utilisateur, d\'une bibliothèque et les créations de comptes sont retrouvables', function () {
    $w = toolsWorld();
    $this->travelTo('2026-09-20 09:00:00');
    ActivityLogService::log($w->librarianA->id, 'creation_document', 'Livre du jour', $w->algo);
    ActivityLogService::log($w->admin->id, 'creation_bibliotheque', $w->b->name, $w->b);
    ActivityLogService::log($w->admin->id, 'modification_bibliotheque', $w->b->name, $w->b, ['name' => ['before' => 'Nord', 'after' => 'Bibliothèque Nord']]);
    ActivityLogService::log($w->admin->id, 'creation_compte', 'Rabe Jean — etudiant', User::factory()->create(['role' => 'etudiant', 'name' => 'Rabe Jean', 'library_id' => $w->a->id]));
    $tools = toolsFor($w->admin);

    // « Quelles actions le bibliothécaire Jean a-t-il effectuées aujourd'hui ? »
    expect($tools->run('rechercher_actions', ['utilisateur' => 'jean dupont', 'date' => '2026-09-20'])['total'])->toBe(1);
    // « Quelle bibliothèque a été créée / modifiée récemment ? »
    expect($tools->run('rechercher_actions', ['action' => 'creation_bibliotheque'])['actions'][0]['element'])->toBe('Bibliothèque Nord')
        ->and($tools->run('rechercher_actions', ['type_element' => 'bibliotheque', 'element' => 'Nord'])['total'])->toBe(2);
    // « Qui a créé cet utilisateur ? »
    $creation = $tools->run('rechercher_actions', ['action' => 'creation_compte', 'element' => 'Rabe'])['actions'][0];
    expect($creation)->toMatchArray(['effectuee_par' => 'Admin Un', 'nature_element' => 'compte']);
    // Un bibliothécaire de la bibliothèque B ne voit pas les actions de la bibliothèque A.
    expect(toolsFor($w->librarianB)->run('rechercher_actions', ['utilisateur' => 'jean dupont'])['trouve'])->toBeFalse();
});

// ---------- Robustesse ----------

test('les arguments invalides renvoient une erreur explicite sans lever d\'exception ni fuiter de données', function () {
    $tools = toolsFor(toolsWorld()->admin);

    expect($tools->run('rechercher_actions', ['date' => '12/04/2026'])['erreur'])->toContain('AAAA-MM-JJ')
        ->and($tools->run('rechercher_actions', ['date' => '2026-02-31'])['erreur'])->toContain('date valide')
        ->and($tools->run('rechercher_actions', ['date_debut' => '2026-05-01', 'date_fin' => '2026-04-01'])['erreur'])->toContain('précéder')
        ->and($tools->run('compter_documents', ['statut' => 'supprimé'])['erreur'])->toContain('Valeur invalide')
        ->and($tools->run('repartition_documents', [])['erreur'])->toContain('obligatoire')
        ->and($tools->run('historique_document', [])['erreur'])->toContain('obligatoire')
        ->and($tools->run('supprimer_tout', ['x' => 1])['erreur'])->toContain('inconnu')
        ->and($tools->run('compter_documents', ['titre' => ['tableau']])['erreur'])->toContain('texte');

    // Injection SQL : traitée comme du simple texte (requêtes paramétrées).
    expect($tools->run('rechercher_documents', ['titre' => "'; DROP TABLE documents; --"])['trouve'])->toBeFalse();
    expect(Document::count())->toBeGreaterThan(0);
});

test('les outils sont en lecture seule : aucune donnée n\'est modifiée ni journalisée', function () {
    $w = toolsWorld();
    $logs = ActivityLog::count();
    $documents = Document::withTrashed()->count();
    $tools = toolsFor($w->admin);

    foreach (['compter_documents', 'repartition_documents', 'rechercher_documents', 'historique_document', 'rechercher_actions', 'rechercher_bibliotheques', 'aucune_donnee_necessaire'] as $tool) {
        $tools->run($tool, ['par' => 'type', 'titre' => 'Algo']);
    }

    expect(ActivityLog::count())->toBe($logs)->and(Document::withTrashed()->count())->toBe($documents);
});

test('les déclarations d\'outils dépendent du rôle : le bibliothécaire ne peut pas viser une bibliothèque', function () {
    $w = toolsWorld();
    $adminNames = collect(toolsFor($w->admin)->declarations())->pluck('name')->all();
    $librarianDeclarations = collect(toolsFor($w->librarianA)->declarations());

    expect($adminNames)->toBe(['compter_documents', 'repartition_documents', 'rechercher_documents', 'historique_document', 'rechercher_actions', 'rechercher_bibliotheques', 'aucune_donnee_necessaire']);
    expect(json_encode(toolsFor($w->admin)->declarations()))->toContain('"bibliotheque"')->toContain('permissions_modifiees');
    expect(json_encode($librarianDeclarations->all()))->not->toContain('"bibliotheque":')->not->toContain('permissions_modifiees')->not->toContain('vidage_corbeille');
    // Aucun paramètre ne permet de fournir un identifiant.
    expect(json_encode(toolsFor($w->admin)->declarations()))->not->toContain('library_id')->not->toContain('user_id');
});
