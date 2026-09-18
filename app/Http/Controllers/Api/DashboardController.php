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
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json([
            'total_users' => \App\Models\User::count(),

            'pending_account_validations' => AccountRequest::where(
                'status',
                'verifiee'
            )->count(),

            'total_documents' => \App\Models\Document::where(
                'status',
                'publie'
            )->count(),

            'pending_account_requests' => AccountRequest::where(
                'status',
                'en_attente'
            )->count(),

            'total_consultations' => Consultation::count(),

            'total_ai_queries' => AiQuery::count(),

            'total_favorites' => Favorite::count(),
        ]);
    }
}