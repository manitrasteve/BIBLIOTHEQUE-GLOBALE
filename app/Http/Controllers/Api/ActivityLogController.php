<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    // Admin : historique global. Utilisateur : ses propres activités (voir routes).
    public function index(Request $request)
    {
        $query = ActivityLog::with(['user:id,name,role', 'library:id,name'])->orderByDesc('created_at')->orderByDesc('id');

        // `mine=1` : « Mes activités » — même pour l'administrateur, uniquement ses propres actions.
        if (!$request->user()->isAdmin() || $request->boolean('mine')) {
            $query->where('user_id', $request->user()->id);
        } elseif ($action = $request->get('action')) {
            $query->where('action', $action);
        }

        return response()->json($query->paginate(30));
    }
}
