<?php

function pwaManifest(): array
{
    return json_decode(file_get_contents(public_path('manifest.webmanifest')), true, 512, JSON_THROW_ON_ERROR);
}

test('le manifest PWA est valide et installable', function () {
    $manifest = pwaManifest();

    expect($manifest)->toHaveKeys(['name', 'short_name', 'description', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'icons'])
        ->and($manifest['display'])->toBe('standalone')
        ->and($manifest['start_url'])->toBe('/')
        ->and($manifest['scope'])->toBe('/');

    $sizes = collect($manifest['icons'])->pluck('sizes');
    expect($sizes)->toContain('192x192', '512x512')
        ->and(collect($manifest['icons'])->pluck('purpose'))->toContain('maskable');
});

test('chaque icône du manifest existe et a la taille annoncée', function () {
    foreach (pwaManifest()['icons'] as $icon) {
        $path = public_path(ltrim($icon['src'], '/'));
        expect(file_exists($path))->toBeTrue("Icône manquante : {$icon['src']}");

        [$width, $height] = getimagesize($path);
        expect("{$width}x{$height}")->toBe($icon['sizes']);
    }
    expect(file_exists(public_path('images/pwa/apple-touch-icon.png')))->toBeTrue();
});

test('la page principale déclare le manifest et l\'icône iOS', function () {
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)->toContain('rel="manifest"')
        ->and($html)->toContain('apple-touch-icon')
        ->and($html)->toContain('name="theme-color"');
});

test('le service worker ne met jamais en cache l\'API, les documents ni les requêtes non-GET', function () {
    $sw = file_get_contents(public_path('sw.js'));

    expect($sw)->toContain("url.pathname.startsWith('/api/')")
        ->and($sw)->toContain("url.pathname.startsWith('/storage/')")
        ->and($sw)->toContain("request.method !== 'GET'")
        ->and($sw)->toContain('skipWaiting')
        ->and($sw)->toContain('clients.claim')
        ->and($sw)->toContain('caches.delete')
        ->and(file_exists(public_path('offline.html')))->toBeTrue();
});
