<?php

// Assistant du bibliothécaire : « combien de bibliothécaires dans ma bibliothèque ? » (nombre, noms, date de création des comptes)
// et « mon historique » (tout, aujourd'hui ou une date). Le périmètre vient du compte authentifié, jamais des arguments de Gemini.

use App\Models\ActivityLog;
use App\Models\Library;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\Assistant\AssistantScope;
use App\Services\Assistant\AssistantTools;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

function staffWorld(): object
{
    config(['services.gemini.key' => 'test-key']);
    $a = Library::factory()->create(['name' => 'Bibliothèque Centrale']);
    $b = Library::factory()->create(['name' => 'Bibliothèque Nord']);
    $make = fn (Library $lib, string $name, string $createdAt, array $extra = []) => User::factory()->create(array_merge(
        ['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $lib->id, 'name' => $name, 'created_at' => $createdAt], $extra));

    $jean = $make($a, 'Jean Dupont', '2026-01-10 08:00:00');
    $marie = $make($a, 'Marie Rasoa', '2026-03-05 10:30:00');
    $zo = $make($a, 'Zo Andria', '2026-06-20 09:00:00', ['is_active' => false]);
    $make($a, 'Ancien Supprimé', '2025-12-01 08:00:00')->delete();          // corbeille : jamais comptée
    User::factory()->create(['role' => 'etudiant', 'library_id' => $a->id, 'name' => 'Étudiant Centrale']); // pas un bibliothécaire
    $paul = $make($b, 'Paul Nord', '2026-02-02 08:00:00');
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'name' => 'Admin Un']);

    return (object) compact('a', 'b', 'jean', 'marie', 'zo', 'paul', 'admin');
}

function staffTools(User $user): AssistantTools
{
    return new AssistantTools(AssistantScope::for($user));
}

// ---------- Nombre, noms et date de création des bibliothécaires ----------

test('le bibliothécaire obtient le total, les noms et la date de création des comptes de SA bibliothèque uniquement', function () {
    $w = staffWorld();

    $result = staffTools($w->jean)->run('lister_bibliothecaires', []);

    expect($result['trouve'])->toBeTrue()
        ->and($result['total'])->toBe(3)                       // Jean, Marie, Zo — ni le compte supprimé, ni l'étudiant, ni Paul
        ->and($result['comptes_actifs'])->toBe(2)->and($result['comptes_inactifs'])->toBe(1)
        ->and(collect($result['bibliothecaires'])->pluck('nom')->all())->toBe(['Jean Dupont', 'Marie Rasoa', 'Zo Andria'])
        ->and(collect($result['bibliothecaires'])->pluck('compte_cree_le')->all())->toBe(['2026-01-10', '2026-03-05', '2026-06-20'])
        ->and($result['bibliothecaires'][2]['compte'])->toContain('inactif')
        ->and($result['perimetre'])->toBe('Bibliothèque « Bibliothèque Centrale »');

    // Données minimales : ni e-mail, ni téléphone, ni identifiant technique.
    $json = json_encode($result, JSON_UNESCAPED_UNICODE);
    expect($json)->not->toContain('Paul Nord')->not->toContain('Ancien Supprimé')->not->toContain('Étudiant Centrale')
        ->not->toContain('@')->not->toContain('"id"')->not->toContain('phone');
});

test('demander une autre bibliothèque ou glisser des identifiants ne change jamais le périmètre du bibliothécaire', function () {
    $w = staffWorld();
    $tools = staffTools($w->jean);

    $other = $tools->run('lister_bibliothecaires', ['bibliotheque' => 'Nord']);
    expect($other['hors_perimetre'])->toBeTrue()->and($other['trouve'])->toBeFalse()->and(json_encode($other))->not->toContain('Paul');

    $spoofed = $tools->run('lister_bibliothecaires', ['library_id' => $w->b->id, 'user_id' => $w->paul->id, 'role' => 'administrateur']);
    expect($spoofed['total'])->toBe(3)->and(json_encode($spoofed))->not->toContain('Paul Nord');

    // Son propre nom de bibliothèque reste accepté.
    expect($tools->run('lister_bibliothecaires', ['bibliotheque' => 'Centrale']))->toHaveKey('total', 3);
});

test('l\'administrateur voit les bibliothécaires de toutes les bibliothèques et peut cibler l\'une d\'elles', function () {
    $w = staffWorld();
    $tools = staffTools($w->admin);

    $all = $tools->run('lister_bibliothecaires', []);
    expect($all['total'])->toBe(4)->and(collect($all['bibliothecaires'])->pluck('bibliotheque')->unique()->sort()->values()->all())->toBe(['Bibliothèque Centrale', 'Bibliothèque Nord']);

    $nord = $tools->run('lister_bibliothecaires', ['bibliotheque' => 'Nord']);
    expect($nord['total'])->toBe(1)->and($nord['bibliothecaires'][0]['nom'])->toBe('Paul Nord');
});

test('une bibliothèque sans bibliothécaire renvoie « non trouvé » sans erreur', function () {
    $w = staffWorld();
    Library::factory()->create(['name' => 'Bibliothèque Vide']);

    expect(staffTools($w->admin)->run('lister_bibliothecaires', ['bibliotheque' => 'Vide']))->toMatchArray(['trouve' => false, 'total' => 0]);
});

// ---------- Historique personnel ----------

function staffHistory(object $w): void
{
    test()->travelTo('2026-04-12 11:30:00'); // 14:30 à Madagascar
    ActivityLogService::log($w->jean->id, 'modification_document', 'Vieux document');
    test()->travelTo('2026-05-01 05:00:00');
    ActivityLogService::log($w->jean->id, 'connexion', 'Connexion');
    test()->travelTo('2026-09-20 06:00:00'); // « aujourd'hui » : 20/09/2026
    ActivityLogService::log($w->jean->id, 'publication_document', 'Doc du jour');
    ActivityLogService::log($w->jean->id, 'consultation_document', 'Lecture du jour');
    ActivityLogService::log($w->marie->id, 'archivage_document', 'Doc de Marie');   // collègue, même bibliothèque
    ActivityLogService::log($w->paul->id, 'archivage_document', 'Doc de Paul');     // autre bibliothèque
    test()->travelTo('2026-09-20 09:00:00');
}

test('« mon historique » sans précision : tout l\'historique du compte connecté, rien des autres', function () {
    $w = staffWorld();
    staffHistory($w);

    $result = staffTools($w->jean)->run('mon_historique', []);

    expect($result['trouve'])->toBeTrue()->and($result['total'])->toBe(4)
        ->and($result['par_type_action'])->toEqualCanonicalizing(['Document modifié' => 1, 'Connexion' => 1, 'Document publié' => 1, "Consultation d'un document" => 1])
        ->and(collect($result['actions'])->pluck('date')->all())->toBe(['2026-09-20', '2026-09-20', '2026-05-01', '2026-04-12'])
        ->and($result['filtres'])->toBe(['periode' => 'tout'])
        ->and(json_encode($result, JSON_UNESCAPED_UNICODE))->not->toContain('Doc de Marie')->not->toContain('Doc de Paul');
});

test('« aujourd\'hui » ne renvoie que les actions du jour ; une date précise ne renvoie que ce jour, à l\'heure locale', function () {
    $w = staffWorld();
    staffHistory($w);
    $tools = staffTools($w->jean);

    $today = $tools->run('mon_historique', ['periode' => 'aujourdhui']);
    expect($today['total'])->toBe(2)->and(collect($today['actions'])->pluck('element')->sort()->values()->all())->toBe(['Doc du jour', 'Lecture du jour']);

    $day = $tools->run('mon_historique', ['date' => '2026-04-12']);
    expect($day['total'])->toBe(1)->and($day['actions'][0])->toMatchArray(['action' => 'Document modifié', 'element' => 'Vieux document', 'date' => '2026-04-12', 'heure' => '14:30']);

    // Période : du 1er mai au 30 septembre.
    expect($tools->run('mon_historique', ['date_debut' => '2026-05-01', 'date_fin' => '2026-09-30'])['total'])->toBe(3);

    // Jour sans action : « non trouvé », pas d'invention.
    expect($tools->run('mon_historique', ['date' => '2026-07-07']))->toMatchArray(['trouve' => false, 'total' => 0]);

    // Date invalide : erreur explicite pour que Gemini corrige son appel.
    expect($tools->run('mon_historique', ['date' => '12/04/2026']))->toHaveKey('erreur');
});

test('l\'historique personnel ne peut jamais être détourné vers une autre personne, par arguments ou identifiants', function () {
    $w = staffWorld();
    staffHistory($w);

    $spoofed = staffTools($w->jean)->run('mon_historique', ['utilisateur' => 'Marie Rasoa', 'user_id' => $w->marie->id, 'bibliotheque' => 'Nord', 'library_id' => $w->b->id]);

    expect($spoofed['total'])->toBe(4)->and(json_encode($spoofed, JSON_UNESCAPED_UNICODE))->not->toContain('Doc de Marie')->not->toContain('Doc de Paul');
    // Marie obtient SON historique, pas celui de Jean.
    $marie = staffTools($w->marie)->run('mon_historique', []);
    expect($marie['total'])->toBe(1)->and($marie['actions'][0]['element'])->toBe('Doc de Marie');
});

test('les deux nouveaux outils sont en lecture seule', function () {
    $w = staffWorld();
    staffHistory($w);
    $logs = ActivityLog::count();
    $users = User::withTrashed()->count();

    staffTools($w->jean)->run('lister_bibliothecaires', []);
    staffTools($w->jean)->run('mon_historique', []);

    expect(ActivityLog::count())->toBe($logs)->and(User::withTrashed()->count())->toBe($users);
});

// ---------- De bout en bout : question → Gemini → outil Laravel → réponse ----------

function staffCall(string $name, array $args = []): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['functionCall' => ['name' => $name, 'args' => $args]]]]]]];
}

function staffText(string $text): array
{
    return ['candidates' => [['content' => ['role' => 'model', 'parts' => [['text' => $text]]]]]];
}

test('via l\'API : les données envoyées à Gemini pour « combien de bibliothécaires » et « mon historique » viennent de la base', function () {
    $w = staffWorld();
    staffHistory($w);
    Sanctum::actingAs($w->jean);

    $cases = [
        ['Combien de bibliothécaires dans ma bibliothèque ?', 'lister_bibliothecaires', [], ['"total":3', 'Jean Dupont', 'Marie Rasoa', 'Zo Andria', '2026-03-05'], 'Liste des bibliothécaires'],
        ["Quel est mon historique d'aujourd'hui ?", 'mon_historique', ['periode' => 'aujourdhui'], ['"total":2', 'Doc du jour'], 'Mon historique'],
        ['Mon historique du 12/04/2026 ?', 'mon_historique', ['date' => '2026-04-12'], ['Vieux document', '14:30'], 'Mon historique'],
    ];
    foreach ($cases as [$question, $tool, $args, $facts, $label]) {
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push(staffCall($tool, $args))->push(staffText('Réponse.'))]);

        $response = $this->postJson('/api/assistant/librarian', ['question' => $question])->assertOk();

        $sent = json_encode(Http::recorded()[1][0]->data()['contents'][2], JSON_UNESCAPED_UNICODE);
        expect($sent)->toContain(...$facts)->and($sent)->not->toContain('Paul Nord')->not->toContain('Doc de Marie');
        expect($response->json('sources.0.libelle'))->toBe($label)->and($response->json('ok'))->toBeTrue();
    }
});
