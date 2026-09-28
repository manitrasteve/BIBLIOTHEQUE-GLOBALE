<?php

namespace App\Services\Pollinations;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Client de Pollinations.ai (texte et images, gratuit, sans clé obligatoire).
 *
 * Les appels sont synchrones (10 à 60 s) : ils ne doivent être faits que depuis une
 * tâche de file (GenerateAiCoverJob), jamais dans une requête HTTP du site.
 *
 * Sans jeton, Pollinations n'accepte qu'une requête à la fois par adresse IP
 * (HTTP 429 « Queue full ») : PollinationsRateLimited permet à l'appelant de réessayer.
 */
class PollinationsClient
{
    private const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

    // Consigne donnée au modèle de texte pour transformer un document en scène à dessiner.
    private const SCENE_INSTRUCTIONS = 'You write prompts for an image generator. Given an academic document '
        . '(title, subtitle, field, summary; often in French), reply with ONE English sentence of at most 35 words '
        . 'describing a concrete visual scene that clearly represents its specific subject (places, landscapes, '
        . 'objects, activities, symbols). Use the subtitle and summary to be specific. No text, no letters, '
        . 'no book, no person holding a book. Output only the sentence.';

    private function token(): string
    {
        return trim((string) config('services.pollinations.token'));
    }

    private function http(int $timeout): PendingRequest
    {
        $request = Http::connectTimeout(10)->timeout(max(5, $timeout));

        return $this->token() !== '' ? $request->withToken($this->token()) : $request;
    }

    /**
     * Décrit en une phrase anglaise une scène visuelle représentant le document.
     *
     * @param  array<string, ?string>  $details  title, subtitle, category, type, keywords, abstract
     */
    public function describeScene(array $details, int $timeout = 25): string
    {
        $document = implode("\n", array_filter([
            'Title: ' . ($details['title'] ?? ''),
            !empty($details['subtitle']) ? 'Subtitle: ' . $details['subtitle'] : null,
            !empty($details['type']) ? 'Document type: ' . $details['type'] : null,
            !empty($details['category']) ? 'Field: ' . $details['category'] : null,
            !empty($details['keywords']) ? 'Keywords: ' . $details['keywords'] : null,
            !empty($details['abstract']) ? 'Summary: ' . $details['abstract'] : null,
        ]));

        $url = $this->token() !== ''
            ? rtrim((string) config('services.pollinations.gen_url'), '/') . '/v1/chat/completions'
            : rtrim((string) config('services.pollinations.text_url'), '/') . '/openai';

        try {
            $response = $this->http($timeout)->post($url, [
                'model' => config('services.pollinations.text_model') ?: 'openai',
                'messages' => [
                    ['role' => 'system', 'content' => self::SCENE_INSTRUCTIONS],
                    ['role' => 'user', 'content' => $document],
                ],
                'private' => true,
            ]);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Pollinations (texte) ne répond pas : ' . $e->getMessage());
        }

        $this->throwIfFailed($response->status(), (string) $response->body(), 'texte');

        // Une seule ligne, sans guillemets ni préfixe, longueur bornée.
        $scene = trim((string) $response->json('choices.0.message.content'));
        $scene = trim(preg_replace('/\s+/u', ' ', $scene), " \t\"'«»");
        $scene = preg_replace('/^(prompt|scene|image)\s*:\s*/i', '', $scene);

        if (mb_strlen($scene) < 10) {
            throw new RuntimeException("Pollinations n'a pas décrit de scène.");
        }

        return Str::limit($scene, 300, '');
    }

    /**
     * @return array{mime:string, data:string}
     */
    public function generate(string $prompt, int $width = 768, int $height = 1024, ?int $timeout = null): array
    {
        // Avec un jeton (enter.pollinations.ai) : API authentifiée, plus fiable et sans filigrane.
        // Sans jeton : accès anonyme historique, gratuit mais limité et saturé par moments.
        $endpoint = $this->token() !== ''
            ? rtrim((string) config('services.pollinations.gen_url'), '/') . '/image/'
            : rtrim((string) config('services.pollinations.base_url'), '/') . '/prompt/';

        $query = array_filter([
            'width' => $width,
            'height' => $height,
            'model' => config('services.pollinations.model'),
            'seed' => random_int(1, 2_000_000_000), // une nouvelle image à chaque « Régénérer »
            'nologo' => 'true',
            'private' => 'true', // ne pas publier l'image dans le flux public Pollinations
        ], fn ($v) => $v !== null && $v !== '');

        try {
            $response = $this->http($timeout ?? (int) config('services.pollinations.timeout', 60))
                ->get($endpoint . rawurlencode($prompt), $query);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Pollinations ne répond pas : ' . $e->getMessage());
        }

        $data = (string) $response->body();
        $this->throwIfFailed($response->status(), $data, 'image');

        if ($data === '' || strlen($data) > self::MAX_DOWNLOAD_BYTES) {
            throw new RuntimeException('Pollinations a renvoyé une image vide ou trop lourde.');
        }

        // Le type est déterminé sur le contenu réel (une page d'erreur HTML peut arriver en 200).
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($data) ?: '';
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            throw new RuntimeException("Pollinations n'a pas renvoyé d'image ({$mime}).");
        }

        return ['mime' => $mime, 'data' => $data];
    }

    private function throwIfFailed(int $status, string $body, string $what): void
    {
        if ($status < 400) {
            return;
        }

        // 429 direct, ou 500 qui enveloppe un 429 du modèle communautaire.
        if ($status === 429 || str_contains($body, '429') || stripos($body, 'rate limit') !== false) {
            throw new PollinationsRateLimited("Pollinations ({$what}) est saturé : " . substr($body, 0, 200));
        }

        throw new RuntimeException("Échec de Pollinations ({$what}, HTTP {$status}) : " . substr($body, 0, 300));
    }
}
