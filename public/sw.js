/*
 * Service Worker — application INSTALLABLE, pas hors ligne.
 *
 * - Jamais mis en cache : /api (données, IA, RAG), /storage (documents, PDF),
 *   toute requête non-GET, tout ce qui n'est pas de la même origine.
 * - Pages (navigations) : réseau d'abord ; hors connexion, simple page
 *   « connexion requise » (offline.html). Le HTML n'est jamais figé en cache,
 *   donc un nouveau build est toujours récupéré.
 * - Ressources statiques : /build/assets/* (noms hachés par Vite) en cache d'abord,
 *   icônes / manifest / logo en « stale-while-revalidate ».
 * - Mise à jour : CACHE_VERSION change => les anciens caches sont supprimés à l'activation.
 */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `bm-static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
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
    const keys = await cache.keys();
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

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
        );
        return;
    }

    if (isHashedAsset(url)) {
        event.respondWith(cacheFirst(request));
    } else if (isStaticFile(url)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
