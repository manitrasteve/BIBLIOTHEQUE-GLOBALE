<?php

use App\Models\AccountRequest;
use Illuminate\Support\Facades\Route;

// Reçus imprimables des demandes de compte
Route::get('/tickets/account/{uuid}', function (string $uuid) {
    $accountRequest = AccountRequest::with('library')->where('uuid', $uuid)->firstOrFail();
    return view('tickets.account', compact('accountRequest'));
});

// Frontend React
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');
