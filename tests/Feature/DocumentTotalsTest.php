<?php

use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

function totalsStaff(string $role): User
{
    return User::factory()->create(['role' => $role, 'is_active' => true, 'library_id' => Library::factory()->create()->id]);
}

function totalsDocs(array $statuses, array $attributes = []): void
{
    foreach ($statuses as $status => $count) {
        // Par défaut : la bibliothèque du compte connecté (un bibliothécaire ne voit que la sienne).
        $own = auth()->user()?->library_id ? ['library_id' => auth()->user()->library_id] : [];
        Document::factory()->count($count)->create(array_merge(['status' => $status], $own, $attributes));
    }
}

test('les totaux par statut viennent de la base et excluent la corbeille', function (string $role) {
    Sanctum::actingAs(totalsStaff($role));
    totalsDocs(['brouillon' => 3, 'publie' => 5, 'archive' => 2]);
    Document::factory()->create(['status' => 'publie'])->delete(); // corbeille : jamais comptée

    $counts = $this->getJson('/api/documents-manage')->assertOk()->json('counts');

    expect($counts)->toMatchArray(['all' => 10, 'brouillon' => 3, 'publie' => 5, 'archive' => 2]);
})->with(['administrateur', 'bibliothecaire']);

test('sans aucun document tous les totaux valent zéro', function () {
    Sanctum::actingAs(totalsStaff('administrateur'));

    expect($this->getJson('/api/documents-manage')->assertOk()->json('counts'))
        ->toMatchArray(['all' => 0, 'brouillon' => 0, 'publie' => 0, 'archive' => 0, 'by_type' => []]);
});

test('la répartition par type fusionne les variantes de casse, d\'accents et les anciens codes', function () {
    Sanctum::actingAs(totalsStaff('administrateur'));
    foreach (['livre', 'Livre', 'LIVRE', 'memoire', 'Mémoire', 'Thèse', 'Livre numérique', 'rapport de stage'] as $type) {
        Document::factory()->create(['type' => $type]);
    }

    $byType = collect($this->getJson('/api/documents-manage')->json('counts.by_type'))->pluck('count', 'type')->all();

    expect($byType)->toBe(['Livre' => 3, 'Mémoire' => 2, 'Livre numérique' => 1, 'Rapport de stage' => 1, 'Thèse' => 1])
        ->and(array_sum($byType))->toBe(8);
});

test('les totaux suivent la recherche et ignorent le statut sélectionné', function () {
    Sanctum::actingAs(totalsStaff('bibliothecaire'));
    totalsDocs(['brouillon' => 2, 'publie' => 3], ['title' => 'Algorithmique']);
    totalsDocs(['publie' => 4, 'archive' => 1], ['title' => 'Botanique']);

    $response = $this->getJson('/api/documents-manage?q=algo&status=brouillon')->assertOk();

    // La liste est filtrée par statut, mais chaque bouton garde son propre nombre pour la recherche « algo ».
    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('total'))->toBe(2)
        ->and($response->json('counts'))->toMatchArray(['all' => 5, 'brouillon' => 2, 'publie' => 3, 'archive' => 0]);

    // Champ de recherche vidé : totaux généraux.
    expect($this->getJson('/api/documents-manage')->json('counts.all'))->toBe(10);
    // Recherche sans résultat : zéro partout.
    expect($this->getJson('/api/documents-manage?q=zzzqqq')->json('counts'))->toMatchArray(['all' => 0, 'by_type' => []]);
});

test('le filtre de bibliothèque s\'applique aussi aux totaux', function () {
    Sanctum::actingAs(totalsStaff('administrateur'));
    $libraryA = Library::factory()->create();
    $libraryB = Library::factory()->create();
    totalsDocs(['publie' => 2, 'brouillon' => 1], ['library_id' => $libraryA->id]);
    totalsDocs(['publie' => 4], ['library_id' => $libraryB->id]);

    expect($this->getJson("/api/documents-manage?library_id={$libraryA->id}")->json('counts'))->toMatchArray(['all' => 3, 'publie' => 2, 'brouillon' => 1])
        ->and($this->getJson('/api/documents-manage')->json('counts.all'))->toBe(7);
});

test('la pagination fonctionne et les totaux restent ceux de l\'ensemble', function () {
    Sanctum::actingAs(totalsStaff('administrateur'));
    totalsDocs(['publie' => 30]);

    $page1 = $this->getJson('/api/documents-manage')->assertOk();
    $page2 = $this->getJson('/api/documents-manage?page=2')->assertOk();

    expect($page1->json('data'))->toHaveCount(20)->and($page1->json('total'))->toBe(30)->and($page1->json('last_page'))->toBe(2)
        ->and($page2->json('data'))->toHaveCount(10)
        ->and($page1->json('counts.all'))->toBe(30)->and($page2->json('counts.all'))->toBe(30);
});

test('le calcul des totaux ne dépend pas du nombre de documents (pas de chargement inutile)', function () {
    Sanctum::actingAs(totalsStaff('administrateur'));
    Category::factory()->create();

    totalsDocs(['publie' => 3]);
    DB::flushQueryLog(); DB::enableQueryLog();
    $this->getJson('/api/documents-manage')->assertOk();
    $few = count(DB::getQueryLog());

    totalsDocs(['publie' => 17, 'brouillon' => 5]);
    DB::flushQueryLog();
    $this->getJson('/api/documents-manage')->assertOk();
    $many = count(DB::getQueryLog());

    expect($many)->toBe($few);
});

test('les totaux sont réservés au personnel', function () {
    foreach (['etudiant', 'enseignant', 'chercheur'] as $role) {
        Sanctum::actingAs(User::factory()->create(['role' => $role, 'is_active' => true]));
        $this->getJson('/api/documents-manage')->assertForbidden();
    }
    $this->app['auth']->forgetGuards();
    $this->getJson('/api/documents-manage')->assertUnauthorized();
});

test('l\'accueil reçoit la catégorie de chaque document publié', function () {
    $category = Category::factory()->create(['name' => 'Informatique']);
    Document::factory()->create(['status' => 'publie', 'category_id' => $category->id]);
    Document::factory()->create(['status' => 'brouillon', 'category_id' => $category->id]);

    $data = $this->getJson('/api/documents')->assertOk()->json('data');

    expect($data)->toHaveCount(1)->and($data[0]['category'])->toBe('Informatique');
});
