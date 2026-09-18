<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class ResolveOptionalUser {
    public function handle(Request $request, Closure $next){
        if (!$request && $request->bearerToken()) {
            if ($user = auth('sanctum')->user()){
                $request->setUserResolver(fn () => $user);

            }
        }
        return $next($request);
    }
}
