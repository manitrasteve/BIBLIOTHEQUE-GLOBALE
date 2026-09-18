<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasPermission
{
    /** Administrators retain full access; permissions are individual for librarians. */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }

        if (!$user->is_active || !collect($permissions)->contains(fn (string $permission) => $user->hasPermission($permission))) {
            return response()->json(['message' => 'Accès refusé : permission insuffisante.'], 403);
        }

        return $next($request);
    }
}
