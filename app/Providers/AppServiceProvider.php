<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Connexion : limite par couple e-mail + IP (anti force brute) sans bloquer tout un réseau
        // partagé (salle informatique, Wi-Fi de l'université) derrière une même adresse IP.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(10)
            ->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip())
            ->response(fn () => response()->json([
                'message' => 'Trop de tentatives de connexion. Réessayez dans une minute.',
            ], 429)));
    }
}
