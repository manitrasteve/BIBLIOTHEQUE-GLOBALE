@include('emails.notice', [
    'heading' => 'Demande de création de compte transmise',
    'paragraphs' => [
        'Bonjour ' . trim($request->first_name . ' ' . $request->last_name) . ',',
        'Le Service Numérique a enregistré votre demande de création de compte et l’a transmise à l’administrateur pour validation.',
        'Dès que votre compte sera validé, vous recevrez un nouvel e-mail contenant votre numéro de compte et le lien pour créer votre mot de passe.',
    ],
    'details' => ['Référence de la demande' => $request->request_number],
    'buttonLabel' => 'Voir ma demande',
    'buttonUrl' => rtrim(config('app.url'), '/') . '/ticket/' . $request->uuid,
    'footerNote' => 'Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.',
])
