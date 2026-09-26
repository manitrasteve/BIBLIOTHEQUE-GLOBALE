/*
 * Service Worker — application installable, avec un mode hors ligne limité.
 *
 * - Jamais mis en cache : /api (données, IA, RAG), /storage (documents, PDF),
 *   toute requête non-GET, tout ce qui n'est pas de la même origine.
 * - Pages (navigations) : réseau d'abord, toujours (un nouveau build est donc toujours
 *   récupéré en ligne). La dernière page reçue est gardée comme « coquille » de secours :
 *   hors connexion, l'application démarre quand même (ex. Mes favoris, enregistrés sur
 *   l'appareil) ; à défaut de coquille, page « connexion requise » (offline.html).
 * - Ressources statiques : /build/assets/* (noms hachés par Vite) en cache d'abord,
 *   icônes / manifest / logo en « stale-while-revalidate ».
 * - Mise à jour : CACHE_VERSION change => les anciens caches sont supprimés à l'activation.
 */
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `bm-static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const SHELL_URL = '/__app-shell'; // clé de cache de la coquille HTML de l'application
const MAX_STATIC_ENTRIES = 80;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(STATIC_CACHE)
            .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('bm-static-') && key !== STATIC_CACHE)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

function isHashedAsset(url) {
    return url.pathname.startsWith('/build/assets/');
}

function isStaticFile(url) {
    return (
        url.pathname.startsWith('/images/') ||
        url.pathname === '/manifest.webmanifest' ||
        url.pathname === '/favicon.ico'
    );
}

async function trim(cache) {
    // La page hors ligne et la coquille ne sont jamais évincées (ce sont les plus anciennes entrées).
    const keys = (await cache.keys()).filter((request) => {
        const path = new URL(request.url).pathname;
        return path !== OFFLINE_URL && path !== SHELL_URL;
    });
    for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i += 1) {
        await cache.delete(keys[i]);
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
        await cache.put(request, response.clone());
        await trim(cache);
    }
    return response;
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);

    return cached || network;
}

async function navigate(request) {
    try {
        const response = await fetch(request);
        // Même HTML pour toutes les routes (application React) : on garde la dernière version reçue.
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(SHELL_URL, response.clone());
        }
        return response;
    } catch {
        return (await caches.match(SHELL_URL)) || (await caches.match(OFFLINE_URL)) || Response.error();
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(navigate(request));
        return;
    }

    if (isHashedAsset(url)) {
        event.respondWith(cacheFirst(request));
    } else if (isStaticFile(url)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
