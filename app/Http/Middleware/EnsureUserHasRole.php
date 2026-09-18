<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasRole
{
    /**
     * Usage dans les routes :
     *   ->middleware('role:administrateur')
     *   ->middleware('role:administrateur,bibliothecaire')
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Compte en attente de validation par l\'administrateur.'], 403);
        }

        $normalizedRoles = array_map(function (string $role): string {
            return $role === 'admin' ? 'administrateur' : $role;
        }, $roles);

        $normalizedCurrentRole = $user->role === 'admin' ? 'administrateur' : $user->role;

        if (!in_array($normalizedCurrentRole, $normalizedRoles, true)) {
            return response()->json(['message' => 'Accès refusé : rôle insuffisant.'], 403);
        }

        return $next($request);
    }
}
