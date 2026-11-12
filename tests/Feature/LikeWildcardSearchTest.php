<?php

// « % » et « _ » saisis dans une recherche sont des caractères ordinaires, pas des jokers SQL :
// sans échappement, chercher « _ » ou « % » renvoyait tout le catalogue.

use App\Models\Document;
use App\Support\Like;

test('les jokers SQL d\'une saisie sont échappés', function () {
    expect(Like::contains('100%'))->toBe('%100\\%%')
        ->and(Like::contains('a_b'))->toBe('%a\\_b%')
        ->and(Like::contains('c:\\dossier'))->toBe('%c:\\\\dossier%')
        ->and(Like::startsWith('x_'))->toBe('x\\_%');
});

test('chercher « % » ou « _ » ne renvoie pas tout le catalogue', function () {
    Document::factory()->create(['status' => 'publie', 'title' => 'Droit foncier', 'keywords' => 'terre']);
    Document::factory()->create(['status' => 'publie', 'title' => 'Économie rurale', 'keywords' => 'agriculture']);

    foreach (['%', '_', '__'] as $q) {
        foreach (['', '&by=title', '&by=keyword'] as $by) {
            expect($this->getJson('/api/documents?q=' . urlencode($q) . $by)->assertOk()->json('data'))->toHaveCount(0);
        }
        expect($this->getJson('/api/documents/suggestions?q=' . urlencode($q . $q))->assertOk()->json('documents'))->toHaveCount(0);
    }

    // Une recherche ordinaire fonctionne toujours.
    expect($this->getJson('/api/documents?q=foncier')->assertOk()->json('data'))->toHaveCount(1);
});
