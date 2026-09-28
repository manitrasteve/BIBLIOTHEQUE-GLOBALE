<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#11116f">
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" type="image/png" sizes="192x192" href="/images/pwa/icon-192.png">
    <link rel="apple-touch-icon" href="/images/pwa/apple-touch-icon.png">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Bibliothèque UMG">
    <meta name="description" content="Bibliothèque Numérique de l'Université de Mahajanga">
    <title>Bibliothèque Numérique — Université de Mahajanga</title>

    <script>
        (function () {
            try {
                if (localStorage.getItem('bm_theme') !== 'light') {
                    document.documentElement.classList.add('dark');
                }
            } catch (e) {}
        })();
    </script>

    <style>
        /* Écran d'attente affiché avant le chargement de React (remplacé au démarrage de l'app). */
        /* Fond de l'écran d'attente : couleur publiée dans Apparence du site, sinon celle d'origine. */
        body { margin: 0; background: var(--site-light-background, #f6f7fb); }
        html.dark body { background: var(--site-dark-background, #0a0b1c); }
        .boot-loading {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            font-size: 0.95rem;
            color: #64748b;
        }
        html.dark .boot-loading { color: #94a3b8; }
    </style>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    {{-- Manrope : police de la charte UMG ; Newsreader : citations et mode Texte du lecteur. --}}
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet">
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.jsx'])

    {{-- Couleurs publiées depuis Paramètres → Apparence du site (variables --site-* construites
         uniquement à partir de valeurs HEX validées ; vide = couleurs d'origine). --}}
    @php($siteThemeCss = \App\Http\Controllers\Api\ThemeController::activeCss())
    @if ($siteThemeCss !== '')
        <style id="site-theme">{!! $siteThemeCss !!}</style>
    @endif
</head>
<body>
    <div id="app">
        <p class="boot-loading" role="status">Chargement de la bibliothèque…</p>
    </div>
</body>
</html>
