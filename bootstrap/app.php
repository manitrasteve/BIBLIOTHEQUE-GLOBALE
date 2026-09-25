<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureUserHasRole::class,
            'permission' => \App\Http\Middleware\EnsureUserHasPermission::class,
            'optional.auth' => \App\Http\Middleware\ResolveOptionalUser::class,
        ]);

        // Pas de route nommée « login » (la connexion est gérée par React sur
        // /connexion) : sans cela, une requête API non authentifiée qui
        // n'envoie pas « Accept: application/json » provoque une erreur 500.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/connexion');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // L'API répond toujours en JSON (401, 404, 422…), même sans en-tête Accept.
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
    })->create();
