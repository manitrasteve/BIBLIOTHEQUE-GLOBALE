<?php

// Test de fumée : chaque route de l'API, appelée par chaque rôle (et sans connexion),
// avec des paramètres normaux puis malformés, ne doit jamais provoquer d'erreur serveur (5xx).

use App\Models\AccountRequest;
use App\Models\AdminMessage;
use App\Models\AdminMessageRecipient;
use App\Models\AppNotification;
use App\Models\Author;
use App\Models\Category;
use App\Models\Consultation;
use App\Models\CourseList;
use App\Models\Document;
use App\Models\DocumentNote;
use App\Models\Favorite;
use App\Models\Feedback;
use App\Models\Library;
use App\Models\Permission;
use App\Models\ProblemReport;
use App\Models\ReadingProgress;
use App\Models\SearchHistory;
use App\Models\StaffConversation;
use App\Models\StaffMessage;
use App\Models\TeacherClass;
use App\Models\User;
use App\Models\WatchTopic;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

function smokeWorld(): array
{
    $library = Library::factory()->create(['name' => 'Centrale']);
    $category = Category::factory()->create(['name' => 'Informatique']);
    $author = Author::factory()->create(['name' => 'Ada Lovelace']);

    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true, 'library_id' => $library->id]);
    $librarian = User::factory()->create(['role' => 'bibliothecaire', 'is_active' => true, 'library_id' => $library->id]);
    $librarian->permissions()->sync(Permission::pluck('id'));
    $student = User::factory()->create(['role' => 'etudiant', 'is_active' => true, 'library_id' => $library->id, 'school' => 'Lycée A', 'niveau_detail' => 'Terminale']);
    $teacher = User::factory()->create(['role' => 'enseignant', 'is_active' => true, 'library_id' => $library->id, 'school' => 'Lycée A']);
    $researcher = User::factory()->create(['role' => 'chercheur', 'is_active' => true, 'library_id' => $library->id]);

    TeacherClass::create(['user_id' => $teacher->id, 'school' => 'Lycée A', 'level' => 'Terminale']);

    $published = Document::factory()->create([
        'title' => 'Algorithmique', 'slug' => 'algorithmique', 'status' => 'publie', 'published_at' => now(),
        'library_id' => $library->id, 'category_id' => $category->id, 'keywords' => 'algo, tri', 'created_by' => $librarian->id,
    ]);
    $published->authors()->sync([$author->id]);
    $draft = Document::factory()->create(['status' => 'brouillon', 'library_id' => $library->id, 'category_id' => $category->id]);
    $submitted = Document::factory()->create(['status' => 'soumis', 'library_id' => $library->id, 'category_id' => $category->id, 'created_by' => $teacher->id]);
    $trashed = Document::factory()->create(['status' => 'brouillon', 'library_id' => $library->id, 'category_id' => $category->id]);
    $trashed->delete();

    foreach ([$student, $teacher, $researcher, $admin, $librarian] as $u) {
        Consultation::create(['user_id' => $u->id, 'document_id' => $published->id, 'consulted_at' => now()]);
        Favorite::create(['user_id' => $u->id, 'document_id' => $published->id]);
        ReadingProgress::create(['user_id' => $u->id, 'document_id' => $published->id, 'last_page' => 3, 'total_pages' => 10]);
        AppNotification::create(['user_id' => $u->id, 'type' => 'document_ajoute', 'title' => 'Nouveau', 'message' => 'm', 'related_type' => Document::class, 'related_id' => $published->id]);
    }
    $note = DocumentNote::create(['user_id' => $student->id, 'document_id' => $published->id, 'page' => 2, 'body' => 'note']);

    $list = CourseList::create(['teacher_id' => $teacher->id, 'title' => 'Bibliographie', 'school' => 'Lycée A', 'level' => 'Terminale']);
    $item = $list->items()->create(['document_id' => $published->id, 'position' => 1]);

    $search = SearchHistory::create(['user_id' => $researcher->id, 'query' => 'algo']);
    $topic = WatchTopic::create(['user_id' => $researcher->id, 'type' => 'mot_cle', 'term' => 'algo', 'last_seen_at' => now()->subDay()]);

    $feedback = Feedback::create(['user_id' => $student->id, 'type' => 'suggestion', 'subject' => 's', 'message' => 'm', 'rating' => 4, 'status' => 'nouveau']);
    $report = ProblemReport::create(['user_id' => $student->id, 'type' => 'bug', 'subject' => 's', 'description' => 'd', 'status' => 'nouveau']);

    $conversation = StaffConversation::create(['admin_id' => $admin->id, 'librarian_id' => $librarian->id]);
    $staffMessage = StaffMessage::create(['conversation_id' => $conversation->id, 'sender_id' => $admin->id, 'recipient_id' => $librarian->id, 'message' => 'Bonjour']);

    $adminMessage = AdminMessage::create(['sender_id' => $admin->id, 'subject' => 's', 'message' => 'm', 'recipient_count' => 1, 'success_count' => 1, 'failure_count' => 0]);
    $recipient = AdminMessageRecipient::create(['admin_message_id' => $adminMessage->id, 'user_id' => $student->id, 'email' => $student->email, 'status' => 'envoye']);

    $accountRequest = AccountRequest::factory()->create(['library_id' => $library->id]);

    $trashedUser = User::factory()->create(['role' => 'etudiant', 'library_id' => $library->id]);
    $trashedUser->delete();

    return [
        'users' => compact('admin', 'librarian', 'student', 'teacher', 'researcher'),
        'params' => [
            'slug' => $published->slug,
            'library' => $library->id,
            'category' => $category->id,
            'author' => $author->id,
            'document' => $submitted->id,
            'uuid' => $accountRequest->uuid,
            'token' => 'jeton-inexistant',
            'accountRequest' => $accountRequest->id,
            'user' => $student->id,
            'librarian' => $librarian->id,
            'courseList' => $list->id,
            'item' => $item->id,
            'note' => $note->id,
            'search' => $search->id,
            'topic' => $topic->id,
            'feedback' => $feedback->id,
            'report' => $report->id,
            'conversation' => $conversation->id,
            'message' => $staffMessage->id,
            'adminMessage' => $adminMessage->id,
            'recipient' => $recipient->id,
            'appNotification' => AppNotification::where('user_id', $student->id)->value('id'),
            'id' => $trashed->id,
            'version' => 1,
            'requestId' => 'inconnu',
        ],
    ];
}

function smokeUri(string $uri, array $params): string
{
    return '/' . preg_replace_callback('/\{(\w+)\??\}/', fn ($m) => (string) ($params[$m[1]] ?? 1), $uri);
}

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    Http::fake();
    Mail::fake();
});

test('aucune route GET de l\'API ne renvoie d\'erreur serveur, quel que soit le rôle', function () {
    $world = smokeWorld();
    $failures = [];

    $routes = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($r) => str_starts_with($r->uri(), 'api/') && in_array('GET', $r->methods(), true))
        ->reject(fn ($r) => str_contains($r->uri(), '/stream')); // flux (PDF/SSE) testés ailleurs

    foreach (array_merge(['visiteur' => null], $world['users']) as $role => $user) {
        foreach ($routes as $route) {
            $this->app['auth']->forgetGuards();
            if ($user) {
                Sanctum::actingAs($user);
            }

            $uri = smokeUri($route->uri(), $world['params']);
            foreach ([$uri, $uri . '?q[]=a&by[]=x&category_id[]=1&library_id[]=1&year[]=1&type[]=a&language[]=b&status[]=x&page=abc&author[]=z&search[]=s&role[]=r&is_active[]=1&action[]=a&user_id[]=1&from[]=x&to[]=y&period[]=p&months[]=m&month[]=m&establishment[]=e&published[]=1'] as $url) {
                $response = $this->getJson($url);
                if ($response->status() >= 500) {
                    $failures[] = "[{$role}] GET {$url} → {$response->status()} " . mb_substr((string) $response->json('message'), 0, 200);
                }
            }
        }
    }

    expect($failures)->toBe([]);
});

test('aucune route d\'écriture de l\'API ne renvoie d\'erreur serveur avec un corps vide ou malformé', function () {
    $failures = [];

    $routes = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($r) => str_starts_with($r->uri(), 'api/') && array_intersect(['POST', 'PUT', 'DELETE'], $r->methods()))
        ->reject(fn ($r) => str_contains($r->uri(), 'stream'));

    foreach (['visiteur', 'admin', 'librarian', 'student', 'teacher', 'researcher'] as $role) {
        foreach ($routes as $route) {
            foreach ([[], ['q' => ['x'], 'title' => ['x'], 'email' => ['x'], 'ids' => 'abc', 'reason' => ['x'], 'history' => 'x', 'question' => ['x'], 'levels' => 'x', 'colors' => 'x', 'sections' => 'x', 'permissions' => 'x']] as $body) {
                // Monde neuf à chaque appel : les routes destructrices ne faussent pas les suivantes.
                \Illuminate\Support\Facades\DB::beginTransaction();
                $world = smokeWorld();
                $this->app['auth']->forgetGuards();
                if ($role !== 'visiteur') {
                    Sanctum::actingAs($world['users'][$role]);
                }

                $method = collect(['POST', 'PUT', 'DELETE'])->first(fn ($m) => in_array($m, $route->methods(), true));
                $uri = smokeUri($route->uri(), $world['params']);
                $response = $this->json($method, $uri, $body);
                if ($response->status() >= 500) {
                    $failures[] = "[{$role}] {$method} {$uri} " . json_encode($body) . " → {$response->status()} " . mb_substr((string) $response->json('message'), 0, 200);
                }
                \Illuminate\Support\Facades\DB::rollBack();
            }
        }
    }

    expect($failures)->toBe([]);
});
