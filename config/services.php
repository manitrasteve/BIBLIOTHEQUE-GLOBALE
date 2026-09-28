<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'gemini' => [
    'key' => env('GEMINI_API_KEY'),

    'model' => env(
        'GEMINI_MODEL',
        'gemini-flash-latest'
    ),

    // Modèle rapide pour les questions simples (vide = modèle principal).
    'fast_model' => env('GEMINI_FAST_MODEL', 'gemini-3.1-flash-lite'),

    // Modèles essayés dans l'ordre si le modèle demandé est indisponible
    // (503 surcharge, 429 quota, 404 modèle retiré).
    'fallback_models' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env(
            'GEMINI_FALLBACK_MODELS',
            'gemini-flash-latest,gemini-3.8-flash,gemini-3.1-flash-lite'
        ))
    ))),

    // Génération d'images (modèles essayés dans l'ordre).
    'image_models' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env(
            'GEMINI_IMAGE_MODELS',
            'gemini-3.1-flash-image,gemini-3.1-flash-lite-image'
        ))
    ))),

    // Taille maximale d'un PDF envoyé en entrée visuelle (octets).
    'max_inline_pdf_bytes' => (int) env('GEMINI_MAX_INLINE_PDF_BYTES', 15 * 1024 * 1024),

    'embedding_model' => env(
        'GEMINI_EMBEDDING_MODEL',
        'gemini-embedding-001'
    ),
],

    // « Générer une couverture par IA » (formulaire des documents) : génération d'images gratuite ;
    // une couverture dessinée par le serveur est proposée si le service échoue.
    // Sans jeton : accès anonyme (limité, filigrane). Jeton gratuit sur https://enter.pollinations.ai :
    // API authentifiée (gen_url), sans filigrane.
    'pollinations' => [
        'base_url' => env('POLLINATIONS_BASE_URL', 'https://image.pollinations.ai'),
        'gen_url' => env('POLLINATIONS_GEN_URL', 'https://gen.pollinations.ai'),
        // Service de texte : décrit le document en une scène visuelle avant de la dessiner.
        'text_url' => env('POLLINATIONS_TEXT_URL', 'https://text.pollinations.ai'),
        'text_model' => env('POLLINATIONS_TEXT_MODEL', 'openai'),
        // Vide : modèle d'image par défaut du service.
        'model' => env('POLLINATIONS_MODEL'),
        'token' => env('POLLINATIONS_TOKEN'),
        // Délai maximal d'une image ; la tâche entière reste sous 90 s (voir GenerateAiCoverJob).
        'timeout' => (int) env('POLLINATIONS_TIMEOUT', 60),
        // Attente avant de réessayer quand le service est saturé (secondes).
        'retry_delay' => (int) env('POLLINATIONS_RETRY_DELAY', 8),
    ],

];
