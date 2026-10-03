<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Ticket {{ $accountRequest->request_number }}</title>
    <style>
        body { font-family: monospace; width: 380px; margin: 40px auto; }
        .center { text-align: center; }
        hr { border: none; border-top: 1px dashed #000; }
        .actions { margin-top: 20px; text-align: center; }
        @media print { .actions { display: none; } }
    </style>
</head>
<body>
    <div class="center">
        <strong>BIBLIOTHÈQUE NUMÉRIQUE</strong><br>
        UNIVERSITÉ DE MAHAJANGA
    </div>
    <hr>
    <p>Date de création : {{ $accountRequest->created_at->timezone(config('app.display_timezone'))->format('d/m/Y') }}</p>
    <p>NOM : {{ strtoupper($accountRequest->last_name) }}</p>
    <p>PRÉNOM : {{ $accountRequest->first_name }}</p>
    <p>ADRESSE : {{ $accountRequest->address }}</p>
    <p>BIBLIOTHÈQUE : {{ $accountRequest->library->name ?? 'Bibliothèque Numérique Globale' }}</p>
    <hr>
    <p class="center"><strong>N° DE DEMANDE : {{ $accountRequest->request_number }}</strong></p>
    <p>Valable jusqu'au : {{ $accountRequest->expires_at->timezone(config('app.display_timezone'))->format('d/m/Y') }}</p>
    <hr>
    <p class="center">Signature</p>
    <div class="actions">
        <button onclick="window.print()">Imprimer / Télécharger en PDF</button>
    </div>
</body>
</html>
