<?php

namespace App\Providers;

use App\Support\PublicationKicker;
use App\Support\ReminderKicker;
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
        // Rappels « créez votre mot de passe » sans planificateur : déclenchés après une requête web (1 fois / heure).
        if (!$this->app->runningInConsole()) {
            $this->app->terminating(fn () => ReminderKicker::maybeRun());
            // Publication programmée des documents, sans planificateur (au plus 1 fois / minute).
            $this->app->terminating(fn () => PublicationKicker::maybeRun());
        }

        // Connexion : limite par couple e-mail + IP (anti force brute) sans bloquer tout un réseau
        // partagé (salle informatique, Wi-Fi de l'université) derrière une même adresse IP.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(10)
            // « email » non textuel (tableau) : clé limitée à l'IP au lieu d'une erreur 500 avant la validation.
            ->by(mb_strtolower(is_string($request->input('email')) ? $request->input('email') : '').'|'.$request->ip())
            ->response(fn () => response()->json([
                'message' => 'Trop de tentatives de connexion. Réessayez dans une minute.',
            ], 429)));
    }
}
