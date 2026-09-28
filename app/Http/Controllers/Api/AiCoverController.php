<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateAiCoverJob;
use App\Support\QueueKicker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * « Générer une couverture par IA » (formulaire d'ajout / modification d'un document).
 *
 * La génération (Pollinations, avec couverture dessinée par le serveur si le service
 * échoue) tourne en tâche de fond (GenerateAiCoverJob) ; le navigateur interroge l'état
 * toutes les quelques secondes : aucune requête PHP n'attend l'image. Une fois prête,
 * elle est renvoyée au formulaire, qui l'envoie comme une couverture choisie à la main :
 * la création / modification du document (DocumentController) reste inchangée.
 */
class AiCoverController extends Controller
{
    public function generate(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'type' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:255'],
            'abstract' => ['nullable', 'string'],
            'keywords' => ['nullable', 'string', 'max:1000'],
            'instructions' => ['nullable', 'string', 'max:500'],
        ]);

        $requestId = (string) Str::uuid();
        GenerateAiCoverJob::pruneOldImages();

        // Seul l'auteur de la génération peut en consulter le résultat.
        Cache::put($this->ownerKey($requestId), $request->user()->id, now()->addHour());
        Cache::put(GenerateAiCoverJob::stateKey($requestId), ['status' => 'queued'], now()->addHour());

        QueueKicker::dispatch(new GenerateAiCoverJob($requestId, $this->details($data)));

        return response()->json(['request_id' => $requestId, 'status' => 'queued'], 202);
    }

    public function status(Request $request, string $requestId)
    {
        abort_unless(
            Str::isUuid($requestId) && Cache::get($this->ownerKey($requestId)) === $request->user()->id,
            404
        );

        $state = Cache::get(GenerateAiCoverJob::stateKey($requestId));

        if (!is_array($state)) {
            return response()->json(['status' => 'failed', 'message' => 'Cette génération a expiré. Relancez-la.']);
        }

        if (($state['status'] ?? null) !== 'completed') {
            return response()->json(['status' => $state['status'] ?? 'queued', 'message' => $state['message'] ?? null]);
        }

        $image = Storage::disk('local')->get(GenerateAiCoverJob::imagePath($requestId));
        if ($image === null) {
            return response()->json(['status' => 'failed', 'message' => 'Cette génération a expiré. Relancez-la.']);
        }

        return response()->json([
            'status' => 'completed',
            'source' => $state['source'],
            'mime' => $state['mime'],
            'image' => 'data:' . $state['mime'] . ';base64,' . base64_encode($image),
        ]);
    }

    private function ownerKey(string $requestId): string
    {
        return 'ai-cover:' . strtolower($requestId);
    }

    /**
     * Informations du formulaire nettoyées (HTML du résumé retiré, longueurs bornées)
     * pour la tâche de génération.
     */
    private function details(array $data): array
    {
        $clean = fn (?string $v, int $max) => $v ? Str::limit(trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($v)))), $max, '…') : null;

        return [
            'title' => $clean($data['title'], 200),
            'subtitle' => $clean($data['subtitle'] ?? null, 150),
            'type' => $clean($data['type'] ?? null, 60),
            'category' => $clean($data['category'] ?? null, 100),
            'keywords' => $clean($data['keywords'] ?? null, 200),
            'abstract' => $clean($data['abstract'] ?? null, 600),
            'instructions' => $clean($data['instructions'] ?? null, 200),
        ];
    }
}
