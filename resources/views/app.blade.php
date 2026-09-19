<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#2563eb">
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
        body { margin: 0; background: #f7f8fa; }
        html.dark body { background: #0b1220; }
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.jsx'])
</head>
<body>
    <div id="app">
        <p class="boot-loading" role="status">Chargement de la bibliothèque…</p>
    </div>
</body>
</html>
