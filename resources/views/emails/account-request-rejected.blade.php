@include('emails.notice', [
    'heading' => 'Votre demande a été rejetée',
    'paragraphs' => array_values(array_filter([
        'Bonjour ' . trim($request->first_name . ' ' . $request->last_name) . ',',
        'Nous sommes au regret de vous informer que votre demande de création de compte a été rejetée.',
        $request->rejection_reason ? 'Motif du rejet : ' . $request->rejection_reason : null,
        'Si les informations transmises étaient incomplètes ou erronées, vous pouvez déposer une nouvelle demande ou vous rapprocher du Service Numérique de votre bibliothèque.',
    ])),
    'details' => ['Référence de la demande' => $request->request_number],
    'buttonLabel' => 'Voir ma demande',
    'buttonUrl' => rtrim(config('app.url'), '/') . '/ticket/' . $request->uuid,
])
