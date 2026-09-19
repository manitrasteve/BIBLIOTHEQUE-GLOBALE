@include('emails.notice', [
    'heading' => 'Votre demande a été vérifiée',
    'paragraphs' => [
        'Bonjour ' . trim($request->first_name . ' ' . $request->last_name) . ',',
        'Votre demande de création de compte a été vérifiée par le Service Numérique.',
        'Elle a été transmise à l’administrateur pour la validation finale. Vous recevrez un nouvel e-mail dès que votre compte sera validé, avec votre numéro de compte et le lien pour créer votre mot de passe.',
    ],
    'details' => ['Référence de la demande' => $request->request_number],
    'buttonLabel' => 'Voir ma demande',
    'buttonUrl' => rtrim(config('app.url'), '/') . '/ticket/' . $request->uuid,
])
