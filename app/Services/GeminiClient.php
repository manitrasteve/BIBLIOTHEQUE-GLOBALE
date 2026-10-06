<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
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

    $response = Http::connectTimeout(8)->timeout(30)
        ->withHeaders([
            'x-goog-api-key' => $this->key(),
            'Content-Type' => 'application/json',
        ])
        ->post($url, [
            'model' => "models/{$model}",
            'content' => [
                'parts' => [
                    [
                        'text' => $this->sanitizeUtf8($text)
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
                        'text' => $this->sanitizeUtf8($text)
                    ]
                ]
            ],
            'taskType' => 'RETRIEVAL_DOCUMENT',
        ],
        array_values($texts)
    );

    $response = Http::connectTimeout(8)->timeout(120)
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
     * Génère une réponse avec Gemini (texte seul).
     */
    public function generate(
        string $prompt,
        float $temperature = 0.3,
        ?string $model = null
    ): string {
        return $this->generateContents(
            [['role' => 'user', 'parts' => [['text' => $prompt]]]],
            ['temperature' => $temperature, 'model' => $model]
        )['text'];
    }

    /**
     * Liste ordonnée des modèles à essayer : le modèle demandé (ou le
     * modèle principal), puis les modèles de repli configurés.
     *
     * @return string[]
     */
    public function modelChain(?string $preferred = null): array
    {
        $primary = $preferred ?: config('services.gemini.model');

        $chain = array_values(array_unique(array_filter([
            $primary,
            ...(array) config('services.gemini.fallback_models', []),
        ])));

        // Un modèle qui vient d'échouer (surcharge, quota) passe en dernier
        // pendant une minute : on n'attend pas un nouvel échec à chaque question.
        usort($chain, fn ($a, $b) => (int) $this->isDown($a) <=> (int) $this->isDown($b));

        return $chain;
    }

    private function isDown(string $model): bool
    {
        return Cache::has("gemini:down:{$model}");
    }

    private function markDown(string $model): void
    {
        Cache::put("gemini:down:{$model}", true, now()->addMinute());
    }

    /**
     * Requête HTTP Gemini avec délais bornés (une panne réseau ne bloque
     * pas la requête plusieurs minutes).
     */
    private function http(int $timeout): \Illuminate\Http\Client\PendingRequest
    {
        return Http::connectTimeout(8)->timeout($timeout)->withHeaders($this->headers());
    }

    /**
     * Statuts pour lesquels on tente le modèle suivant : surcharge (503),
     * quota (429), erreur serveur, modèle retiré (404).
     */
    private function isRetryable(int $status): bool
    {
        return in_array($status, [404, 429, 500, 502, 503, 504], true);
    }

    private function headers(): array
    {
        return [
            'x-goog-api-key' => $this->key(),
            'Content-Type' => 'application/json',
        ];
    }

    /**
     * Nettoie récursivement les chaînes d'un tableau pour garantir un UTF-8
     * valide : un PDF mal encodé (police CID corrompue, ligature mal
     * mappée…) peut produire des octets invalides qui font échouer le
     * json_encode de Guzzle avant même l'envoi de la requête.
     */
    private function sanitizeDeep(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_string($value)) {
                $data[$key] = $this->sanitizeUtf8($value);
            } elseif (is_array($value)) {
                $data[$key] = $this->sanitizeDeep($value);
            }
        }

        return $data;
    }

    private function sanitizeUtf8(string $text): string
    {
        if ($text === '' || mb_check_encoding($text, 'UTF-8')) {
            return $text;
        }

        $clean = @iconv('UTF-8', 'UTF-8//IGNORE', $text);

        return $clean !== false ? $clean : mb_convert_encoding($text, 'UTF-8', 'UTF-8');
    }

    private function payload(array $contents, array $options): array
    {
        $payload = [
            'contents' => $this->sanitizeDeep($contents),
            'generationConfig' => [
                'temperature' => (float) ($options['temperature'] ?? 0.3),
            ],
        ];

        // Réponse structurée (ex. questions de révision) : JSON valide garanti par l'API.
        if (!empty($options['json'])) {
            $payload['generationConfig']['responseMimeType'] = 'application/json';
        }

        if (!empty($options['system'])) {
            $payload['systemInstruction'] = [
                'parts' => [['text' => $this->sanitizeUtf8($options['system'])]],
            ];
        }

        // Appel de fonctions (assistants de gestion) : options facultatives, absentes du RAG.
        if (!empty($options['tools'])) {
            $payload['tools'] = $options['tools'];
        }
        if (!empty($options['tool_config'])) {
            $payload['toolConfig'] = $options['tool_config'];
        }

        return $payload;
    }

    private function extractText(?array $json): string
    {
        $text = '';

        foreach (($json['candidates'][0]['content']['parts'] ?? []) as $part) {
            if (isset($part['text']) && empty($part['thought'])) {
                $text .= $part['text'];
            }
        }

        return $text;
    }

    /**
     * Raison d'arrêt de la génération (STOP en temps normal) et raison de
     * blocage éventuelle, données par Gemini à côté du texte.
     *
     * @return array{reason: ?string, block_reason: ?string}
     */
    private function finishInfo(?array $json): array
    {
        return [
            'reason' => $json['candidates'][0]['finishReason'] ?? null,
            'block_reason' => $json['promptFeedback']['blockReason'] ?? null,
        ];
    }

    /**
     * Une réponse sans texte n'est retentée sur le modèle suivant que si
     * Gemini signale explicitement un blocage (sécurité, recitation,
     * contenu protégé…) — une fin normale (STOP) sans texte n'est pas un
     * blocage et ne doit pas boucler inutilement sur toute la chaîne.
     *
     * @param array{reason: ?string, block_reason: ?string} $finish
     */
    private function isBlocked(array $finish): bool
    {
        if ($finish['block_reason'] !== null) {
            return true;
        }

        return in_array(
            $finish['reason'],
            ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'OTHER'],
            true
        );
    }

    /**
     * Génération multi-tours / multimodale avec repli automatique.
     *
     * $contents suit le format Gemini : [['role' => 'user'|'model',
     * 'parts' => [['text' => ...] | ['inlineData' => [...]]]]].
     *
     * @return array{text:string,model:string}
     */
    public function generateContents(array $contents, array $options = []): array
    {
        $last = null;

        foreach ($this->modelChain($options['model'] ?? null) as $model) {
            try {
                $response = $this->http($options['timeout'] ?? 60)
                    ->post(
                        "{$this->baseUrl}/models/{$model}:generateContent",
                        $this->payload($contents, $options)
                    );
            } catch (ConnectionException $e) {
                // Délai dépassé / réseau : on tente le modèle suivant.
                $last = new GeminiException("Connexion à Gemini impossible ({$model}) : " . $e->getMessage(), 504);
                $this->markDown($model);
                continue;
            }

            if ($response->successful()) {
                $json = $response->json();
                $text = $this->extractText($json);
                $finish = $this->finishInfo($json);

                if ($text === '' && $this->isBlocked($finish)) {
                    // Blocage de contenu (pas une panne) : on tente le modèle
                    // suivant sans le mettre en veille.
                    $last = new GeminiException(
                        "Réponse Gemini bloquée ({$model}) : " .
                        ($finish['reason'] ?? $finish['block_reason']),
                        0,
                        true
                    );

                    continue;
                }

                return [
                    'text' => $text,
                    'model' => $model,
                    'finish_reason' => $finish['reason'],
                    'block_reason' => $finish['block_reason'],
                ];
            }

            $last = new GeminiException(
                "Échec de la requête de génération Gemini {$model} " .
                "(HTTP {$response->status()}) : " . $response->body(),
                $response->status()
            );

            if (!$this->isRetryable($response->status())) {
                throw $last;
            }

            $this->markDown($model);
        }

        throw $last ?? new GeminiException('Aucun modèle Gemini configuré.', 0);
    }

    /**
     * Génération avec appel de fonctions (outils). Même repli entre modèles que generateContents(),
     * mais renvoie le contenu brut du modèle : il doit être renvoyé tel quel au tour suivant
     * (les modèles récents y joignent une « thoughtSignature » obligatoire).
     *
     * @return array{content:array,text:string,function_calls:array<int,array{name:string,args:array}>,model:string}
     */
    public function generateWithTools(array $contents, array $options = []): array
    {
        $last = null;

        foreach ($this->modelChain($options['model'] ?? null) as $model) {
            try {
                $response = $this->http($options['timeout'] ?? 60)
                    ->post(
                        "{$this->baseUrl}/models/{$model}:generateContent",
                        $this->payload($contents, $options)
                    );
            } catch (ConnectionException $e) {
                $last = new GeminiException("Connexion à Gemini impossible ({$model}) : " . $e->getMessage(), 504);
                $this->markDown($model);
                continue;
            }

            if ($response->successful()) {
                $content = $response->json('candidates.0.content') ?? ['role' => 'model', 'parts' => []];
                $calls = [];

                foreach (($content['parts'] ?? []) as $i => $part) {
                    if (isset($part['functionCall']['name'])) {
                        $calls[] = ['name' => (string) $part['functionCall']['name'], 'args' => (array) ($part['functionCall']['args'] ?? [])];

                        // Sans argument, Gemini envoie « args: {} » : décodé en tableau vide, il serait renvoyé « [] »
                        // (liste) et l'API refuserait la requête. On le garde en objet vide.
                        if (empty($part['functionCall']['args'])) {
                            $content['parts'][$i]['functionCall']['args'] = new \stdClass();
                        }
                    }
                }

                return [
                    'content' => $content,
                    'text' => $this->extractText($response->json()),
                    'function_calls' => $calls,
                    'model' => $model,
                ];
            }

            $last = new GeminiException(
                "Échec de la requête Gemini (outils) {$model} (HTTP {$response->status()}) : " . $response->body(),
                $response->status()
            );

            if (!$this->isRetryable($response->status())) {
                throw $last;
            }

            $this->markDown($model);
        }

        throw $last ?? new GeminiException('Aucun modèle Gemini configuré.', 0);
    }

    /**
     * Génération en flux (SSE). $onDelta reçoit chaque fragment de texte
     * dès son arrivée. Le repli entre modèles n'a lieu qu'avant le premier
     * fragment (jamais au milieu d'une réponse).
     *
     * @return array{text:string,model:string}
     */
    public function streamContents(
        array $contents,
        callable $onDelta,
        array $options = []
    ): array {
        $last = null;

        foreach ($this->modelChain($options['model'] ?? null) as $model) {
            try {
                $response = $this->http($options['timeout'] ?? 90)
                    ->withOptions(['stream' => true])
                    ->post(
                        "{$this->baseUrl}/models/{$model}:streamGenerateContent?alt=sse",
                        $this->payload($contents, $options)
                    );
            } catch (ConnectionException $e) {
                $last = new GeminiException("Connexion à Gemini impossible ({$model}) : " . $e->getMessage(), 504);
                $this->markDown($model);
                continue;
            }

            if (!$response->successful()) {
                $last = new GeminiException(
                    "Échec du flux Gemini {$model} (HTTP {$response->status()}) : " .
                    substr((string) $response->body(), 0, 500),
                    $response->status()
                );

                if (!$this->isRetryable($response->status())) {
                    throw $last;
                }

                $this->markDown($model);

                continue;
            }

            $body = $response->toPsrResponse()->getBody();
            $buffer = '';
            $full = '';
            $finish = ['reason' => null, 'block_reason' => null];

            $handle = function (string $event) use (&$full, &$finish, $onDelta): void {
                if (!str_starts_with($event, 'data:')) {
                    return;
                }

                $json = json_decode(trim(substr($event, 5)), true);
                $delta = $this->extractText($json);

                if ($delta !== '') {
                    $full .= $delta;
                    $onDelta($delta);
                }

                $eventFinish = $this->finishInfo($json);
                if ($eventFinish['reason'] !== null || $eventFinish['block_reason'] !== null) {
                    $finish = $eventFinish;
                }
            };

            while (!$body->eof()) {
                // Normalisation sur le tampon entier (et non sur chaque lecture) : un « \r\n » coupé
                // entre deux lectures de 512 octets fusionnait deux événements et perdait du texte.
                $buffer = str_replace("\r\n", "\n", $buffer . $body->read(512));

                while (($pos = strpos($buffer, "\n\n")) !== false) {
                    $handle(substr($buffer, 0, $pos));
                    $buffer = substr($buffer, $pos + 2);
                }
            }

            // Dernier événement non suivi d'une ligne vide.
            if (trim($buffer) !== '') {
                $handle(trim($buffer));
            }

            if ($full === '' && $this->isBlocked($finish)) {
                // Rien n'a encore été émis : on peut encore basculer sur le
                // modèle suivant sans le mettre en veille.
                $last = new GeminiException(
                    "Réponse Gemini bloquée en flux ({$model}) : " .
                    ($finish['reason'] ?? $finish['block_reason']),
                    0,
                    true
                );

                continue;
            }

            return [
                'text' => $full,
                'model' => $model,
                'finish_reason' => $finish['reason'],
                'block_reason' => $finish['block_reason'],
            ];
        }

        throw $last ?? new GeminiException('Aucun modèle Gemini configuré.', 0);
    }

    /**
     * Génère une image à partir d'un texte.
     *
     * @return array{mime:string,data:string,text:string,model:string}
     */
    public function generateImage(string $prompt): array
    {
        $last = null;

        foreach ((array) config('services.gemini.image_models', []) as $model) {
            try {
                $response = $this->http(90)
                    ->post("{$this->baseUrl}/models/{$model}:generateContent", [
                        'contents' => [['role' => 'user', 'parts' => [['text' => $this->sanitizeUtf8($prompt)]]]],
                        'generationConfig' => ['responseModalities' => ['TEXT', 'IMAGE']],
                    ]);
            } catch (ConnectionException $e) {
                $last = new GeminiException("Connexion à Gemini impossible ({$model}) : " . $e->getMessage(), 504);
                continue;
            }

            if ($response->successful()) {
                $text = '';
                $image = null;

                foreach (($response->json('candidates.0.content.parts') ?? []) as $part) {
                    $inline = $part['inlineData'] ?? $part['inline_data'] ?? null;

                    if ($inline && !empty($inline['data'])) {
                        $image = $inline;
                    } elseif (isset($part['text'])) {
                        $text .= $part['text'];
                    }
                }

                if ($image) {
                    return [
                        'mime' => $image['mimeType'] ?? $image['mime_type'] ?? 'image/png',
                        'data' => $image['data'],
                        'text' => trim($text),
                        'model' => $model,
                    ];
                }

                $last = new GeminiException("Le modèle {$model} n'a renvoyé aucune image.", 200);
                continue;
            }

            $last = new GeminiException(
                "Échec de la génération d'image {$model} (HTTP {$response->status()}) : " .
                substr((string) $response->body(), 0, 500),
                $response->status()
            );

            if (!$this->isRetryable($response->status())) {
                throw $last;
            }
        }

        throw $last ?? new GeminiException('Aucun modèle de génération d\'image configuré.', 0);
    }
}