<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Route publique : si un jeton valide accompagne la requête, $request->user() renvoie le lecteur ;
// sinon (visiteur, jeton invalide ou expiré) la requête continue sans utilisateur, sans erreur 401.
class ResolveOptionalUser {
    public function handle(Request $request, Closure $next){
        if ($request->bearerToken() && ($user = auth('sanctum')->user())) {
            $request->setUserResolver(fn () => $user);
        }
        return $next($request);
    }
}
