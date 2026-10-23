<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Envoi de SMS aux membres (numéros malgaches).
 *
 * Pilote choisi par SMS_DRIVER :
 *  - « log »  : le SMS est seulement écrit dans storage/logs (développement, aucun coût) ;
 *  - « mapi » : envoi réel via l'API du fournisseur Mapi ;
 *  - « off »  : aucun envoi.
 */
class SmsService
{
    /**
     * Numéro au format international (+2613XXXXXXXX), ou null s'il n'est pas un mobile malgache valide.
     * Accepte « 034 12 345 67 », « 0341234567 », « +261 34 12 345 67 », « 261341234567 »…
     */
    public static function normalizeMadagascar(?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);

        if (str_starts_with($digits, '00261')) {
            $digits = substr($digits, 5);
        } elseif (str_starts_with($digits, '261')) {
            $digits = substr($digits, 3);
        } elseif (str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }

        // Mobiles : 32, 33, 34, 37, 38… suivis de 7 chiffres.
        return preg_match('/^3[2-9]\d{7}$/', $digits) ? '+261'.$digits : null;
    }

    /** Envoie un SMS. Lève une exception si le fournisseur refuse : l'appelant décide quoi en faire. */
    public function send(string $phone, string $message): void
    {
        $to = self::normalizeMadagascar($phone);
        if ($to === null) {
            throw new \InvalidArgumentException("Numéro de téléphone invalide pour un SMS : {$phone}");
        }

        match (config('services.sms.driver')) {
            'mapi' => $this->sendWithMapi($to, $message),
            'off' => null,
            default => Log::info('SMS (non envoyé, pilote « log »)', ['to' => $to, 'message' => $message]),
        };
    }

    /**
     * Envoi via Mapi (https://mapi.mg/documentation) : POST /msg/send en multipart, numéro au format local (034…).
     * Jeton expiré ou révoqué (401) : nouvelle connexion puis un seul nouvel essai.
     */
    private function sendWithMapi(string $to, string $message): void
    {
        $fields = ['Recipient' => '0'.substr($to, 4), 'Message' => $message, 'Channel' => 'sms'];

        $response = $this->mapiPost('/msg/send', $fields, $this->mapiToken());
        if ($response->status() === 401) {
            $response = $this->mapiPost('/msg/send', $fields, $this->mapiToken(refresh: true));
        }

        if (!$response->successful() || $response->json('status') !== true) {
            throw new \RuntimeException("Mapi a refusé le SMS ({$response->status()}) : ".($response->json('result') ?? $response->json('message') ?? $response->body()));
        }
    }

    // Jeton Mapi valable 15 min : gardé en cache 14 min pour ne pas se reconnecter à chaque SMS.
    private function mapiToken(bool $refresh = false): string
    {
        if ($refresh) {
            Cache::forget('mapi_sms_token');
        }

        return Cache::remember('mapi_sms_token', now()->addMinutes(14), function () {
            $response = $this->mapiPost('/authentication/login', [
                'Username' => (string) config('services.sms.mapi.username'),
                'Password' => (string) config('services.sms.mapi.password'),
            ]);

            $token = $response->json('token');
            if (!$response->successful() || !is_string($token) || $token === '') {
                throw new \RuntimeException("Connexion à Mapi impossible ({$response->status()}) : ".($response->json('message') ?? $response->body()));
            }

            return $token;
        });
    }

    private function mapiPost(string $path, array $fields, ?string $token = null): Response
    {
        return Http::asMultipart()
            ->acceptJson()
            ->connectTimeout(20)
            ->timeout(40) // connexion vers Mapi parfois lente : l'envoi part en arrière-plan, l'attente ne gêne personne
            ->when($token, fn ($http) => $http->withHeaders(['Authorization' => $token])) // sans préfixe « Bearer »
            ->post(rtrim((string) config('services.sms.mapi.url'), '/').$path, $fields);
    }
}
