<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GeminiClient
{
    private string $baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    /**
     * Récupère la clé API Gemini depuis la configuration Laravel.
     */
    private function key(): string
    {
        $key = config('services.gemini.key');

        if (!$key) {
            throw new RuntimeException(
                "GEMINI_API_KEY n'est pas configurée dans le fichier .env."
            );
        }

        return trim($key);
    }

    /**
     * Génère l'embedding d'un texte.
     */
   public function embed(string $text): array
{
    $model = config(
        'services.gemini.embedding_model',
        'gemini-embedding-001'
    );

    $url = "{$this->baseUrl}/models/{$model}:embedContent";

    $response = Http::timeout(60)
        ->withHeaders([
            'x-goog-api-key' => $this->key(),
            'Content-Type' => 'application/json',
        ])
        ->post($url, [
            'model' => "models/{$model}",
            'content' => [
                'parts' => [
                    [
                        'text' => $text
                    ]
                ]
            ],
            'taskType' => 'RETRIEVAL_QUERY',
        ]);

    if ($response->failed()) {
        throw new RuntimeException(
            "Échec de la requête d'embedding Gemini " .
            "(HTTP {$response->status()}) : " .
            $response->body()
        );
    }

    $embedding = $response->json('embedding.values');

    if (!is_array($embedding) || empty($embedding)) {
        throw new RuntimeException(
            "Gemini n'a retourné aucun embedding."
        );
    }

    return $embedding;
}

/**
 * Génère les embeddings de plusieurs textes en une seule requête.
 */
public function batchEmbed(array $texts): array
{
    if (empty($texts)) {
        return [];
    }

    $model = config(
        'services.gemini.embedding_model',
        'gemini-embedding-001'
    );

    $url = "{$this->baseUrl}/models/{$model}:batchEmbedContents";

    $requests = array_map(
        fn(string $text) => [
            'model' => "models/{$model}",
            'content' => [
                'parts' => [
                    [
                        'text' => $text
                    ]
                ]
            ],
            'taskType' => 'RETRIEVAL_DOCUMENT',
        ],
        array_values($texts)
    );

    $response = Http::timeout(120)
        ->withHeaders([
            'x-goog-api-key' => $this->key(),
            'Content-Type' => 'application/json',
        ])
        ->post($url, [
            'requests' => $requests
        ]);

    if ($response->failed()) {
        throw new RuntimeException(
            "Échec de la requête d'embedding groupée Gemini " .
            "(HTTP {$response->status()}) : " .
            $response->body()
        );
    }

    $embeddings = $response->json('embeddings') ?? [];

    return array_map(
        fn(array $embedding) => $embedding['values'] ?? [],
        $embeddings
    );
}
    /**
     * Génère une réponse avec Gemini.
     */
    public function generate(
        string $prompt,
        float $temperature = 0.3
    ): string {
        $model = config(
            'services.gemini.model',
            'gemini-2.5-flash'
        );

        $url = "{$this->baseUrl}/models/{$model}:generateContent";

        $response = Http::timeout(120)
            ->withHeaders([
                'x-goog-api-key' => $this->key(),
                'Content-Type' => 'application/json',
            ])
            ->post($url, [
                'contents' => [
                    [
                        'parts' => [
                            [
                                'text' => $prompt
                            ]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => $temperature
                ]
            ]);

        if ($response->failed()) {
            throw new RuntimeException(
                "Échec de la requête de génération Gemini " .
                "(HTTP {$response->status()}) : " .
                $response->body()
            );
        }

        return $response->json(
            'candidates.0.content.parts.0.text'
        ) ?? '';
    }
}