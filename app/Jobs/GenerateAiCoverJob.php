<?php

namespace App\Jobs;

use App\Services\Covers\CoverImage;
use App\Services\Covers\FallbackCoverRenderer;
use App\Services\Pollinations\PollinationsClient;
use App\Services\Pollinations\PollinationsRateLimited;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Génère une couverture en tâche de fond :
 *  1. le document (titre, sous-titre, résumé…) est décrit en une scène visuelle concrète
 *     en anglais (Pollinations texte) : les modèles d'image gratuits ne lisent que le début
 *     du prompt et comprennent mal un titre français abstrait ;
 *  2. la scène est dessinée (Pollinations image), en réessayant si le service est saturé ;
 *  3. en cas d'échec, une couverture est dessinée par le serveur.
 * L'image est déposée sur le disque privé et son état en cache, où AiCoverController::status
 * les lit pour le formulaire.
 */
class GenerateAiCoverJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    // Doit rester sous le retry_after de la file « database » (90 s), sinon la tâche
    // serait relancée en double : le travail est borné par BUDGET_SECONDS.
    public int $timeout = 88;

    private const BUDGET_SECONDS = 80;

    private const MAX_IMAGE_ATTEMPTS = 5;

    // Images générées en attente (disque privé « local », jamais exposé publiquement).
    private const DIRECTORY = 'ai-covers';

    /**
     * @param  array{title:string, subtitle:?string, category:?string, type:?string, keywords:?string, abstract:?string, instructions:?string}  $details
     */
    public function __construct(
        public readonly string $requestId,
        public readonly array $details,
    ) {
        $this->onQueue('covers'); // file dédiée : ne pas attendre derrière une indexation de PDF
    }

    public static function stateKey(string $requestId): string
    {
        return 'ai-cover-state:' . strtolower($requestId);
    }

    public function handle(PollinationsClient $pollinations, FallbackCoverRenderer $fallback): void
    {
        $deadline = microtime(true) + self::BUDGET_SECONDS;

        try {
            $image = CoverImage::fit($this->generateIllustration($pollinations, $deadline));
            $source = 'ai';
        } catch (\Throwable $e) {
            report($e);
            $image = $fallback->render(
                $this->details['title'],
                $this->details['subtitle'] ?? null,
                $this->details['category'] ?? null,
                $this->details['type'] ?? null,
            );
            $source = 'fallback';
        }

        // L'image va sur le disque privé, pas dans le cache : avec le cache « database », une valeur
        // de plus de max_allowed_packet (1 Mo par défaut sous XAMPP) ferait échouer l'écriture.
        Storage::disk('local')->put(self::imagePath($this->requestId), $image['data']);

        Cache::put(self::stateKey($this->requestId), [
            'status' => 'completed',
            'source' => $source,
            'mime' => $image['mime'],
        ], now()->addHour());
    }

    public static function imagePath(string $requestId): string
    {
        return self::DIRECTORY . '/' . strtolower($requestId);
    }

    /**
     * Supprime les images de génération laissées sur le disque (non utilisées ou déjà envoyées).
     */
    public static function pruneOldImages(int $olderThanSeconds = 7200): void
    {
        $disk = Storage::disk('local');
        $limit = time() - $olderThanSeconds;

        foreach ($disk->files(self::DIRECTORY) as $file) {
            if ($disk->lastModified($file) < $limit) {
                $disk->delete($file);
            }
        }
    }

    /**
     * @return array{mime:string, data:string}
     */
    private function generateIllustration(PollinationsClient $pollinations, float $deadline): array
    {
        try {
            $scene = $pollinations->describeScene($this->details, 25);
        } catch (\Throwable $e) {
            report($e);
            // Sans description : le titre (et sous-titre) en tête du prompt, c'est mieux que rien.
            $scene = trim($this->details['title'] . '. ' . ($this->details['subtitle'] ?? ''), ' .');
        }

        $prompt = self::imagePrompt($scene, $this->details['instructions'] ?? null);
        $wait = (int) config('services.pollinations.retry_delay', 8);

        for ($attempt = 1; ; $attempt++) {
            $remaining = (int) floor($deadline - microtime(true));
            if ($remaining < 15) {
                throw new \RuntimeException("Pollinations n'a pas répondu à temps.");
            }

            try {
                return $pollinations->generate($prompt, timeout: min(60, $remaining - 3));
            } catch (PollinationsRateLimited $e) {
                // Sans jeton : une requête à la fois par IP (la description vient d'en occuper une).
                if ($attempt >= self::MAX_IMAGE_ATTEMPTS) {
                    throw $e;
                }
                if ($wait > 0) {
                    sleep($wait);
                }
            }
        }
    }

    /**
     * Prompt d'image court, sujet en tête : les petits modèles tronquent vers ~77 jetons.
     */
    public static function imagePrompt(string $scene, ?string $instructions = null): string
    {
        $style = trim((string) $instructions) !== ''
            ? 'Style: ' . Str::limit(trim(preg_replace('/\s+/u', ' ', $instructions)), 120, '') . '.'
            : 'Editorial illustration, painterly, rich harmonious colors.';

        return rtrim($scene, '. ') . '. ' . $style . ' High quality, no text, no letters.';
    }

    public function failed(?\Throwable $e): void
    {
        if ((Cache::get(self::stateKey($this->requestId))['status'] ?? null) === 'completed') {
            return; // une couverture est déjà prête : ne pas l'écraser
        }

        Cache::put(self::stateKey($this->requestId), [
            'status' => 'failed',
            'message' => 'La génération de la couverture a échoué. Réessayez.',
        ], now()->addHour());
    }
}
