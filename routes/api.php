<?php

use App\Http\Controllers\Api\AccountRequestController;
use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AiQueryController;
use App\Http\Controllers\Api\AppNotificationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AuthorController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\LibraryController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\EngagementController;
use App\Http\Controllers\Api\FeedbackController;
use App\Http\Controllers\Api\ProblemReportController;
use App\Http\Controllers\Api\AdminMessageController;
use App\Http\Controllers\Api\SiteUpdateController;
use App\Http\Controllers\Api\UserMessageController;
use App\Http\Controllers\Api\StaffDiscussionController;
use App\Http\Controllers\Api\LibrarianManagementController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ResearchController;
use App\Http\Controllers\Api\TrashController;
use App\Http\Controllers\Api\PermissionManagementController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Routes publiques (aucune connexion requise)
|--------------------------------------------------------------------------
*/
Route::post('/login', [AuthController::class, 'login']);
// Limité : la réponse indique si une adresse a un compte (limite l'énumération d'adresses).
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:10,1');
Route::post('/reset-password', [AuthController::class, 'resetPassword']);
Route::get('/site-updates', [SiteUpdateController::class, 'index']);
Route::get('/site-updates/{uuid}', [SiteUpdateController::class, 'show']);

Route::get('/libraries', [LibraryController::class, 'index']);
Route::get('/libraries/{library}', [LibraryController::class, 'show']);

Route::get('/categories', [CategoryController::class, 'index']);
Route::get('/authors', [AuthorController::class, 'index']);

Route::get('/documents', [DocumentController::class, 'index']);
Route::get('/documents/{slug}', [DocumentController::class, 'show'])->middleware('optional.auth');

Route::post('/account-requests', [AccountRequestController::class, 'store']);
Route::get('/account-requests/{uuid}', [AccountRequestController::class, 'show']);
Route::get('/account-requests/setup/{token}', [AccountRequestController::class, 'setupForm']);
Route::post('/account-requests/verify-member', [AccountRequestController::class, 'verifyMember']);
Route::post('/account-requests/recreate', [AccountRequestController::class, 'recreate']);
Route::post('/account-requests/setup/{token}', [AccountRequestController::class, 'setupPassword']);


/*
|--------------------------------------------------------------------------
| Routes authentifiées (tous rôles actifs)
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::post('/profile', [ProfileController::class, 'update']);
    Route::delete('/profile/photo', [ProfileController::class, 'deletePhoto']);
    Route::post('/notifications/{appNotification}/unread', [AppNotificationController::class, 'markUnread']);
    Route::get('/dashboard/me', [DashboardController::class, 'me']);

    Route::get('/documents/{slug}/stream', [DocumentController::class, 'stream']);

    Route::post('/documents/{slug}/ask', [AiQueryController::class, 'ask']);
    Route::post('/documents/{slug}/ask-stream', [AiQueryController::class, 'askStream']);
    Route::get('/documents/{slug}/ai-history', [AiQueryController::class, 'history']);

    Route::post('/documents/{slug}/favorite', [EngagementController::class, 'toggleFavorite']);
    Route::get('/favorites', [EngagementController::class, 'favorites']);
    Route::get('/mes-consultations', [EngagementController::class, 'myConsultations']);
    Route::get('/mes-questions-ia', [EngagementController::class, 'myAiQueries']);
    Route::get('/mes-lectures', [EngagementController::class, 'myReadings']);

    // Espace chercheur : historique des recherches + veille scientifique.
    Route::middleware('role:chercheur')->prefix('research')->group(function () {
        Route::get('/searches', [ResearchController::class, 'searches']);
        Route::post('/searches', [ResearchController::class, 'storeSearch']);
        Route::delete('/searches', [ResearchController::class, 'clearSearches']);
        Route::delete('/searches/{search}', [ResearchController::class, 'destroySearch']);

        Route::get('/watch-topics', [ResearchController::class, 'topics']);
        Route::post('/watch-topics', [ResearchController::class, 'storeTopic']);
        Route::delete('/watch-topics/{topic}', [ResearchController::class, 'destroyTopic']);
        Route::get('/watch-topics/{topic}/documents', [ResearchController::class, 'topicDocuments']);
        Route::post('/watch-topics/{topic}/seen', [ResearchController::class, 'markTopicSeen']);
    });
    Route::post('/feedbacks', [FeedbackController::class, 'store']);
    Route::post('/problem-reports', [ProblemReportController::class, 'store']);



    Route::get('/notifications', [AppNotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [AppNotificationController::class, 'unreadCount']);
    Route::post('/notifications/{appNotification}/read', [AppNotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [AppNotificationController::class, 'markAllRead']);

    Route::get('/activity-logs', [ActivityLogController::class, 'index']);

    Route::get('/messages', [UserMessageController::class, 'index']);
    Route::post('/messages/{recipient}/read', [UserMessageController::class, 'markRead']);
    Route::delete('/messages/{recipient}', [UserMessageController::class, 'destroy']);
    Route::delete('/messages', [UserMessageController::class, 'clear']);

    Route::get('/staff-discussions/my-conversation', [StaffDiscussionController::class, 'myConversation']);
    Route::get('/staff-discussions/librarians', [StaffDiscussionController::class, 'librarians']);
    Route::get('/staff-discussions/conversation/{librarian}', [StaffDiscussionController::class, 'conversation']);
    Route::get('/staff-discussions/{conversation}/messages', [StaffDiscussionController::class, 'messages']);
    Route::post('/staff-discussions/messages', [StaffDiscussionController::class, 'send']);
    Route::post('/staff-discussions/messages/{message}/read', [StaffDiscussionController::class, 'markAsRead']);
    Route::delete('/staff-discussions/messages/{message}', [StaffDiscussionController::class, 'deleteMessage']);
    Route::delete('/staff-discussions/history', [StaffDiscussionController::class, 'deleteHistory']);


    /*
    |----------------------------------------------------------------------
    | Bibliothécaire + Administrateur
    |----------------------------------------------------------------------
    */
    Route::middleware('role:administrateur,bibliothecaire')->group(function () {
        Route::post('/account-requests/by-librarian', [AccountRequestController::class, 'storeByLibrarian'])->middleware('permission:ajouter_utilisateur');
        Route::post('/categories', [CategoryController::class, 'store']);
        Route::put('/categories/{category}', [CategoryController::class, 'update']);
        Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);

        Route::post('/authors', [AuthorController::class, 'store']);
        Route::put('/authors/{author}', [AuthorController::class, 'update']);
        Route::delete('/authors/{author}', [AuthorController::class, 'destroy']);

        Route::get('/documents-manage', [DocumentController::class, 'manageIndex']);
        Route::get('/documents-manage/{document}', [DocumentController::class, 'manageShow']);
        Route::post('/documents', [DocumentController::class, 'store']);
        Route::put('/documents/{document}', [DocumentController::class, 'update']);
        Route::post('/documents/{document}', [DocumentController::class, 'update']);
        Route::post('/documents/{document}/publish', [DocumentController::class, 'publish'])->middleware('permission:publier_document');
        Route::post('/documents/{document}/archive', [DocumentController::class, 'archive']);
        Route::post('/documents/{document}/reindex', [DocumentController::class, 'reindex']);

        Route::get('/admin-messages/recipients', [AdminMessageController::class, 'recipients']);
        Route::get('/admin-messages', [AdminMessageController::class, 'index']);
        Route::post('/admin-messages', [AdminMessageController::class, 'store']);
        Route::delete('/admin-messages/{adminMessage}', [AdminMessageController::class, 'destroy']);
        Route::delete('/admin-messages', [AdminMessageController::class, 'clearHistory']);

        Route::get('/account-requests', [AccountRequestController::class, 'index']);
        Route::post('/account-requests/{accountRequest}/create-account', [AccountRequestController::class, 'createAccount']);
        Route::post('/account-requests/{accountRequest}/verify', [AccountRequestController::class, 'verify']);
        Route::post('/account-requests/{accountRequest}/reject', [AccountRequestController::class, 'reject']);
        Route::post('/account-requests/{accountRequest}/validate', [AccountRequestController::class, 'validateRequest'])->middleware('permission:valider_demande_compte');

    });

    /*
    |----------------------------------------------------------------------
    | Administrateur uniquement
    |----------------------------------------------------------------------
    */
    Route::middleware('role:administrateur')->group(function () {
        Route::post('/account-requests/{accountRequest}/admin-reject', [AccountRequestController::class, 'adminReject']);
        Route::put('/libraries/{library}', [LibraryController::class, 'update']);
        Route::post('/libraries/{library}', [LibraryController::class, 'update']); // multipart (photo de couverture)
        Route::delete('/libraries/{library}', [LibraryController::class, 'destroy']);

        Route::post('/account-requests/validate-all', [AccountRequestController::class, 'validateAll']);
        Route::post('/account-requests/users/{user}/activate', [AccountRequestController::class, 'activate']);
        Route::get('/consultations', [EngagementController::class, 'adminConsultations']);
        Route::get('/ai-queries', [EngagementController::class, 'adminAiQueries']);
        Route::get('/all-favorites', [EngagementController::class, 'adminFavorites']);
        Route::post('/feedbacks/{feedback}/reply', [FeedbackController::class, 'reply']);
        Route::delete('/feedbacks/clear-all', [FeedbackController::class, 'clearAll']);
        Route::delete('/feedbacks/{feedback}', [FeedbackController::class, 'destroy']);
        Route::post('/problem-reports/{report}/reply', [ProblemReportController::class, 'reply']);
        Route::delete('/problem-reports/clear-all', [ProblemReportController::class, 'clearAll']);
        Route::delete('/problem-reports/{report}', [ProblemReportController::class, 'destroy']);

       Route::get('/users', [UserController::class, 'index']);
       Route::post('/users/creer', [AccountRequestController::class, 'adminCreate']);
       Route::post('/users/{user}/reactivate', [UserController::class, 'reactivate']);
       Route::post('/users/{user}/deactivate', [UserController::class, 'deactivate']);
       Route::delete('/users/{user}', [UserController::class, 'destroy']);
       Route::get('/librarians', [LibrarianManagementController::class, 'index']);
       Route::post('/librarians', [LibrarianManagementController::class, 'store']);
       Route::get('/permissions', [PermissionManagementController::class, 'permissions']);
       Route::get('/bibliothecaires', [PermissionManagementController::class, 'librarians']);
       Route::get('/bibliothecaires/{librarian}/permissions', [PermissionManagementController::class, 'show']);
       Route::put('/bibliothecaires/{librarian}/permissions', [PermissionManagementController::class, 'update']);
    });

    /*
    |----------------------------------------------------------------------
    | Permissions individuelles : ajout de bibliothèque + consultation en lecture seule.
    | L'administrateur passe toujours ; réponses / suppressions restent réservées à l'admin.
    |----------------------------------------------------------------------
    */
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:ajouter_bibliotheque'])->group(function () {
        Route::post('/libraries', [LibraryController::class, 'store']);
    });
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:voir_popularite'])->group(function () {
        Route::get('/engagement-stats', [EngagementController::class, 'stats']);
    });
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:voir_avis_utilisateurs'])->group(function () {
        Route::get('/feedbacks', [FeedbackController::class, 'index']);
    });
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:voir_signalements'])->group(function () {
        Route::get('/problem-reports', [ProblemReportController::class, 'index']);
    });
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:voir_statistiques'])->group(function () {
        Route::get('/dashboard/admin', [DashboardController::class, 'admin']);
    });

    /* Corbeille : admin ou bibliothécaire ayant la permission individuelle. */
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:voir_corbeille'])->group(function () {
        Route::get('/trash', [TrashController::class, 'index']);
    });
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:restaurer_corbeille'])->group(function () {
        Route::post('/trash/users/{id}/restore', [TrashController::class, 'restoreUser']);
        Route::post('/trash/documents/{id}/restore', [TrashController::class, 'restoreDocument']);
    });
    Route::middleware(['role:administrateur,bibliothecaire', 'permission:supprimer_definitivement_corbeille'])->group(function () {
        Route::delete('/trash/users/{id}', [TrashController::class, 'forceUser']);
        Route::delete('/trash/documents/{id}', [TrashController::class, 'forceDocument']);
        Route::delete('/trash', [TrashController::class, 'empty']);
    });

    Route::middleware(['role:administrateur,bibliothecaire', 'permission:supprimer_document'])->group(function () {
        Route::delete('/documents/{document}', [DocumentController::class, 'destroy']);
    });
});
