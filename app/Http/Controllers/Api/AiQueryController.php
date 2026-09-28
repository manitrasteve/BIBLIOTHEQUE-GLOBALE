<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiQuery;
use App\Models\Document;
use App\Services\ActivityLogService;
use App\Services\RagService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AiQueryController extends Controller
{
    /**
     * Charge le document demandé et vérifie les droits d'accès.
     */
    private function authorizedDocument(Request $request, string $slug): Document
    {
        $document = Document::where('slug', $slug)->where('status', 'publie')->firstOrFail();
        $user = $request->user();

        abort_unless($user, 401);
        abort_unless($user->is_active, 403);
        abort_unless($document->isAccessibleBy($user), 403, 'Droits insuffisants pour ce document.');

        return $document;
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'question' => ['required', 'string', 'max:1000'],
            // Contexte facultatif : tours précédents et page ouverte dans le lecteur.
            'history' => ['sometimes', 'array', 'max:8'],
            'history.*.question' => ['required_with:history', 'string', 'max:1000'],
            'history.*.answer' => ['required_with:history', 'string', 'max:20000'],
            'current_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100000'],
        ]);
    }

    private function options(array $data): array
    {
        return [
            'history' => $data['history'] ?? [],
            'current_page' => $data['current_page'] ?? null,
        ];
    }

    /**
     * Enregistre la question/réponse (jamais l'image générée : elle reste
     * uniquement dans la conversation temporaire du navigateur).
     */
    private function record(Request $request, Document $document, string $question, array $result): AiQuery
    {
        $aiQuery = AiQuery::create([
            'user_id' => $request->user()->id,
            'document_id' => $document->id,
            'question' => $question,
            'answer' => $result['answer'],
            'sources' => $result['sources'] ?? [],
        ]);

        ActivityLogService::log($request->user()->id, 'question_ia', $question, $document);

        return $aiQuery;
    }

    private function payload(AiQuery $aiQuery, array $result): array
    {
        $payload = $aiQuery->toArray();

        if (!empty($result['image'])) {
            $payload['image'] = $result['image'];
        }

        $payload['meta'] = $result['meta'] ?? null;

        return $payload;
    }

    // Pose une question à l'assistant IA sur un document déjà consulté.
    public function ask(Request $request, string $slug)
    {
        $document = $this->authorizedDocument($request, $slug);
        $data = $this->validated($request);

        // Comme askStream : plusieurs modèles Gemini peuvent être essayés à la suite ; sous `php -S`,
        // la limite par défaut (60 s) couperait la requête sans réponse JSON.
        @set_time_limit(180);

        $result = app(RagService::class)->answer($document, $data['question'], $this->options($data));

        if (!empty($result['error'])) {
            return response()->json(
                ['message' => $result['answer']],
                ($result['status'] ?? 0) === 429 ? 429 : 503
            );
        }

        $aiQuery = $this->record($request, $document, $data['question'], $result);

        return response()->json($this->payload($aiQuery, $result));
    }

    // Même chose, mais la réponse est envoyée au fil de sa génération (SSE).
    public function askStream(Request $request, string $slug): StreamedResponse
    {
        $document = $this->authorizedDocument($request, $slug);
        $data = $this->validated($request);

        return response()->stream(function () use ($request, $document, $data) {
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
                $result = app(RagService::class)->stream(
                    $document,
                    $data['question'],
                    $this->options($data),
                    fn (string $delta) => $send('delta', ['text' => $delta])
                );

                if (!empty($result['error'])) {
                    $send('error', ['message' => $result['answer']]);

                    return;
                }

                $aiQuery = $this->record($request, $document, $data['question'], $result);

                $send('done', $this->payload($aiQuery, $result));
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

    // Historique des questions posées par l'utilisateur sur un document
    public function history(Request $request, string $slug)
    {
        $document = Document::where('slug', $slug)->firstOrFail();

        $queries = AiQuery::where('document_id', $document->id)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at')
            ->get();

        return response()->json($queries);
    }
}
