<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuse (422) une saisie qui n'est pas de l'UTF-8 valide : elle passe la règle « string » puis
 * provoque une erreur 500 à l'enregistrement (MySQL) ou à l'encodage de la réponse JSON.
 */
class RejectInvalidUtf8
{
    public function handle(Request $request, Closure $next): Response
    {
        $valid = true;
        $input = $request->input(); // formulaire + paramètres d'URL ; les fichiers n'y figurent pas

        array_walk_recursive($input, function ($value) use (&$valid) {
            if (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
                $valid = false;
            }
        });

        if (! $valid) {
            return response()->json(['message' => 'La requête contient des caractères invalides (encodage UTF-8 attendu).'], 422);
        }

        return $next($request);
    }
}
