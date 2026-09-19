<!DOCTYPE html>

<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Création de votre compte</title>
</head>

<body style="margin:0; padding:0; background:#f4f7fb; font-family:Arial, sans-serif; color:#1e293b;">


<div style="max-width:600px; margin:40px auto; background:white; border-radius:16px; padding:35px; box-shadow:0 10px 30px rgba(0,0,0,0.08);">

    <h1 style="margin-top:0; color:#1e3a8a;">
        Bienvenue dans la Bibliothèque Numérique de Mahajanga
    </h1>

    <p>
        Bonjour <strong>{{ $user->name }}</strong>,
    </p>

    <p>
        Votre compte utilisateur vient d'être créé et validé par
        l'administrateur de la Bibliothèque Numérique de Mahajanga.
    </p>

    <!-- NUMÉRO DE COMPTE -->
    <div style="
        margin:25px 0;
        padding:20px;
        background:#eff6ff;
        border:2px solid #bfdbfe;
        border-radius:12px;
        text-align:center;
    ">
        <p style="
            margin:0 0 8px 0;
            font-size:14px;
            color:#475569;
            font-weight:bold;
        ">
            Votre numéro de compte
        </p>

        <p style="
            margin:0;
            font-size:26px;
            color:#1d4ed8;
            font-weight:bold;
            letter-spacing:1px;
        ">
            {{ $request->matricule ?? $user->matricule }}
        </p>

        <p style="
            margin:12px 0 0 0;
            font-size:13px;
            color:#64748b;
        ">
            Veuillez mémoriser et conserver précieusement ce numéro.
            Il pourra vous être demandé ultérieurement en cas de perte
            ou de récupération de vos informations de compte.
        </p>
    </div>

    <p>
        Pour terminer la création de votre compte, vous devez maintenant
        choisir votre mot de passe.
    </p>

    <div style="text-align:center; margin:30px 0;">
        <a
            href="{{ rtrim(config('app.url'), '/') . '/creer-mot-de-passe?token=' . urlencode($token) }}"
            style="
                display:inline-block;
                padding:14px 25px;
                background:#2563eb;
                color:white;
                text-decoration:none;
                border-radius:10px;
                font-weight:bold;
            "
        >
            Créer mon mot de passe
        </a>
    </div>

    <p style="
        padding:15px;
        background:#fff7ed;
        border:1px solid #fed7aa;
        border-radius:10px;
        font-size:14px;
        color:#9a3412;
    ">
        <strong>Important :</strong>
        ce lien de création du mot de passe est valable pendant
        <strong>3 jours</strong>.
    </p>

    <p style="font-size:14px; color:#64748b;">
        Nous vous recommandons également de conserver votre numéro
        de compte dans un endroit sûr afin de pouvoir le retrouver
        facilement en cas de perte.
    </p>

    <p style="font-size:14px; color:#64748b;">
        Si vous n'êtes pas à l'origine de la création de ce compte,
        vous pouvez ignorer cet e-mail et contacter l'administration
        de la Bibliothèque Numérique de Mahajanga.
    </p>

    <hr style="border:none; border-top:1px solid #e2e8f0; margin:30px 0;">

    <p style="font-size:13px; color:#94a3b8; margin-bottom:0;">
        Bibliothèque Numérique de Mahajanga
    </p>

</div>


</body>
</html>
