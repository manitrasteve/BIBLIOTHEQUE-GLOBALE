@php
    $variant = $variant ?? 'validated';
    $accountNumber = $user->matricule ?? ($request->matricule ?? null);
    $libraryName = optional($user->library)->name ?? optional($request->library ?? null)->name;

    $headings = [
        'validated' => 'Votre compte a été validé',
        'created' => 'Votre compte a été créé',
        'new_link' => 'Un nouveau lien vous a été envoyé',
        'reminder' => 'Rappel : créez votre mot de passe',
    ];

    $paragraphs = ['Bonjour ' . $user->name . ','];

    if ($variant === 'reminder') {
        $paragraphs[] = 'Votre compte est prêt, mais votre mot de passe n’a pas encore été créé.';
        $paragraphs[] = 'Votre lien expire bientôt : créez votre mot de passe dès maintenant pour accéder à la Bibliothèque Numérique.';
    } elseif ($variant === 'new_link') {
        $paragraphs[] = 'Un nouveau lien vous a été envoyé pour créer votre mot de passe.';
    } elseif ($variant === 'created') {
        $paragraphs[] = 'Votre compte a été créé par l’administrateur de la Bibliothèque Numérique.';
        $paragraphs[] = 'Vous pouvez maintenant créer votre mot de passe.';
    } else {
        $paragraphs[] = 'Votre compte a été validé.';
        $paragraphs[] = 'Vous pouvez maintenant créer votre mot de passe.';
    }

    $details = [];
    if ($accountNumber) {
        $details['Numéro de compte'] = $accountNumber;
    }
    if ($libraryName) {
        $details['Bibliothèque'] = $libraryName;
    }

    // Même lien sécurisé que celui généré par l'application (token inchangé).
    $setupUrl = rtrim(config('app.url'), '/') . '/creer-mot-de-passe?token=' . urlencode($token);
@endphp
@include('emails.notice', [
    'heading' => $headings[$variant] ?? $headings['validated'],
    'paragraphs' => $paragraphs,
    'details' => $details,
    'buttonLabel' => 'Créer mon mot de passe',
    'buttonUrl' => $setupUrl,
    // Rappel : le lien remplace le précédent sans prolonger le délai (date d'expiration inchangée).
    'note' => $variant === 'reminder' && optional($request ?? null)->setup_expires_at
        ? 'Ce lien remplace le précédent et expire le ' . $request->setup_expires_at->timezone(config('app.display_timezone'))->format('d/m/Y à H:i') . '. Il ne peut être utilisé qu’une seule fois.'
        : ($variant === 'new_link' ? 'Ce nouveau lien' : 'Ce lien') . ' est valable pendant ' . \App\Models\AccountRequest::SETUP_LINK_HOURS . ' heures et ne peut être utilisé qu’une seule fois.',
    'footerNote' => ($accountNumber ? 'Conservez précieusement votre numéro de compte : il pourra vous être demandé en cas de perte de vos informations. ' : '') . 'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail ou contactez l’administration.',
])
