<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountRequest;
use App\Models\AiQuery;
use App\Models\Consultation;
use App\Models\Favorite;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    /**
     * Dashboard de l'utilisateur connecté.
     */
    public function me(Request $request)
    {
        $user = $request->user();
        $today = now()->toDateString();

        return response()->json([
            'today_consultations' => $user->consultations()
                ->whereDate('consulted_at', $today)
                ->count(),

            'today_ai_queries' => $user->aiQueries()
                ->whereDate('created_at', $today)
                ->count(),

            'favorites' => $user->favorites()->count(),

            'unread_notifications' => $user->appNotifications()
                ->unread()
                ->count(),
        ]);
    }

    /**
     * Dashboard de l'administrateur.
     */
    public function admin(Request $request)
    {
        abort_unless($request->user()->hasPermission('voir_statistiques'), 403);

        // Le bibliothécaire ne voit que les chiffres de sa bibliothèque (l'administrateur : la plateforme entière).
        $me = $request->user();
        $ofMyLibrary = fn ($query) => $me->isAdmin()
            ? $query
            : $query->whereHas('document', fn ($d) => $me->restrictToManagedLibrary($d));

        return response()->json([
            'total_users' => $me->restrictToManagedLibrary(\App\Models\User::query())->count(),

            'pending_account_validations' => $me->restrictToManagedLibrary(AccountRequest::where(
                'status',
                'verifiee'
            ))->count(),

            'total_documents' => $me->restrictToManagedLibrary(\App\Models\Document::where(
                'status',
                'publie'
            ))->count(),

            'pending_account_requests' => $me->restrictToManagedLibrary(AccountRequest::where(
                'status',
                'en_attente'
            ))->count(),

            'total_consultations' => $ofMyLibrary(Consultation::query())->count(),

            'total_ai_queries' => $ofMyLibrary(AiQuery::query())->count(),

            'total_favorites' => $ofMyLibrary(Favorite::query())->count(),
        ]);
    }
}