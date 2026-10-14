<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Assistant\AssistantAccessException;
use App\Services\Assistant\ManagementAssistantService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Assistant IA de gestion — ADMINISTRATEUR uniquement (route protégée par role:administrateur,
// et périmètre revérifié par AssistantScope). Aucune bibliothèque ni utilisateur n'est lu dans la requête.
class AdminAssistantController extends Controller
{
    private const TOOL_LABELS = [
        'compter_documents' => 'Comptage des documents',
        'repartition_documents' => 'Répartition des documents',
        'rechercher_documents' => 'Recherche de documents',
        'historique_document' => "Historique d'un document",
        'rechercher_actions' => 'Journal des actions de gestion',
        'rechercher_bibliotheques' => 'Bibliothèques',
        'lister_bibliothecaires' => 'Liste des bibliothécaires',
        'mon_historique' => 'Mon historique',
        'rechercher_activite_membres' => 'Mouvements des membres',
    ];

    private function rules(): array
    {
        return [
            'question' => ['required', 'string', 'max:1000'],
            'history' => ['sometimes', 'array', 'max:12'],
            'history.*.role' => ['required', 'in:user,model'],
            // Les réponses de l'assistant dépassent souvent 1 500 caractères : le service les tronque
            // lui-même. Une limite stricte ici faisait échouer (422) toute la suite de la conversation.
            'history.*.text' => ['required', 'string', 'max:20000'],
        ];
    }

    public function ask(Request $request, ManagementAssistantService $assistant)
    {
        $data = $request->validate($this->rules());

        try {
            $result = $assistant->ask($request->user(), $data['question'], $data['history'] ?? []);
        } catch (AssistantAccessException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }

        return response()->json([
            'answer' => $result['answer'],
            'ok' => $result['ok'],
            'model' => $result['model'],
            'sources' => $this->sources($result['data']),
        ]);
    }

    /**
     * Même réponse que ask(), mais streamée mot à mot (SSE), comme l'assistant documentaire.
     * Événements : start, delta (fragments de texte), done (sources + modèle), error.
     */
    public function askStream(Request $request, ManagementAssistantService $assistant): StreamedResponse
    {
        $data = $request->validate($this->rules());
        $user = $request->user();

        return response()->stream(function () use ($assistant, $user, $data) {
            @set_time_limit(180);

            $send = function (string $event, array $payload): void {
                echo "event: {$event}\n";
                echo 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n\n";

                if (ob_get_level() > 0) {
                    @ob_flush();
                }

                flush();
            };

            $send('start', ['ok' => true]);

            try {
                $result = $assistant->askStream(
                    $user,
                    $data['question'],
                    $data['history'] ?? [],
                    fn (string $delta) => $send('delta', ['text' => $delta])
                );

                $send('done', [
                    'ok' => $result['ok'],
                    'model' => $result['model'],
                    'sources' => $this->sources($result['data']),
                ]);
            } catch (AssistantAccessException $e) {
                $send('error', ['message' => $e->getMessage()]);
            } catch (\Throwable $e) {
                report($e);
                $send('error', ['message' => "L'assistant n'a pas pu répondre pour le moment."]);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream; charset=utf-8',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /** Transparence : quelles données réelles ont été consultées (sans les résultats bruts). */
    private function sources(array $data): array
    {
        return collect($data)->map(fn (array $item) => [
            'outil' => $item['outil'],
            'libelle' => self::TOOL_LABELS[$item['outil']] ?? $item['outil'],
            'criteres' => (object) $item['criteres'],
            'total' => $item['resultat']['total'] ?? null,
            'trouve' => $item['resultat']['trouve'] ?? null,
            'hors_perimetre' => $item['resultat']['hors_perimetre'] ?? false,
            'erreur' => $item['resultat']['erreur'] ?? null,
        ])->values()->all();
    }
}
