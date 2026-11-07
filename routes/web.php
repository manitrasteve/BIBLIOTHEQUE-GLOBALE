<?php

use App\Models\AccountRequest;
use Illuminate\Support\Facades\Route;

// Reçus imprimables des demandes de compte
Route::get('/tickets/account/{uuid}', function (string $uuid) {
    $accountRequest = AccountRequest::with('library')->where('uuid', $uuid)->firstOrFail();
    return view('tickets.account', compact('accountRequest'));
});

// Frontend React (hors /api : une adresse d'API inconnue répond en JSON 404, pas avec la page HTML)
Route::get('/{any}', function () {
    return view('app');
})->where('any', '(?!api(/|$)).*');
