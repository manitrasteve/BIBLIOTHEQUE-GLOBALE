<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentChunk;
use App\Services\ActivityLogService;
use App\Services\GeminiClient;
use Illuminate\Http\Request;

/**
 * Enseignant : questions de révision (QCM, vrai/faux, questions ouvertes) générées par l'IA
 * à partir des pages choisies d'un document indexé. Chaque question cite la page d'où elle vient ;
 * l'enseignant relit, modifie puis exporte (côté navigateur).
 */
class RevisionQuestionController extends Controller
{
    private const MAX_CONTEXT_CHARS = 40000;

    private const TYPES = [
        'qcm' => 'QCM à 4 choix, une seule bonne réponse',
        'vrai_faux' => 'affirmations vrai/faux',
        'ouverte' => 'questions ouvertes à réponse courte',
    ];

    public function __construct(private readonly GeminiClient $gemini)
    {
    }

    public function generate(Request $request, string $slug)
    {
        $document = Document::where('slug', $slug)->where('status', 'publie')->firstOrFail();
        abort_unless($document->isAccessibleBy($request->user()), 403, 'Droits insuffisants pour ce document.');

        $data = $request->validate([
            'type' => ['required', 'in:' . implode(',', array_keys(self::TYPES))],
            'count' => ['required', 'integer', 'min:1', 'max:20'],
            'page_from' => ['nullable', 'integer', 'min:1'],
            'page_to' => ['nullable', 'integer', 'gte:page_from'],
            'topic' => ['nullable', 'string', 'max:200'],
            'level' => ['nullable', 'string', 'max:50'],
        ]);

        $chunks = DocumentChunk::where('document_id', $document->id)
            ->when($data['page_from'] ?? null, fn ($q, $from) => $q->where('page_number', '>=', $from))
            ->when($data['page_to'] ?? null, fn ($q, $to) => $q->where('page_number', '<=', $to))
            ->orderBy('page_number')->orderBy('chunk_index')
            ->get(['page_number', 'content']);

        if ($chunks->isEmpty()) {
            abort(422, DocumentChunk::where('document_id', $document->id)->exists()
                ? 'Aucun texte trouvé sur ces pages. Élargissez l’intervalle de pages.'
                : 'Ce document n’est pas encore indexé pour l’IA. Réessayez dans quelques minutes ou demandez au Service Numérique de le réindexer.');
        }

        [$context, $pages] = $this->context($chunks);

        try {
            $result = $this->gemini->generateContents(
                [['role' => 'user', 'parts' => [['text' => $this->prompt($document, $data, $context)]]]],
                ['temperature' => 0.4, 'json' => true, 'timeout' => 90],
            );
        } catch (\Throwable $e) {
            report($e);
            abort(503, 'L’assistant IA est indisponible pour le moment. Réessayez dans un instant.');
        }

        $questions = $this->parse($result['text'] ?? '', $data['type'], $pages);
        if (!$questions) {
            abort(502, 'L’IA n’a pas renvoyé de questions exploitables. Relancez la génération.');
        }

        ActivityLogService::log($request->user()->id, 'questions_revision', $document->title, $document);

        return response()->json(['document' => $document->only(['title', 'slug']), 'questions' => array_slice($questions, 0, $data['count'])]);
    }

    /** Texte des pages retenues, chaque extrait précédé de son numéro de page, borné en taille. */
    private function context($chunks): array
    {
        $text = '';
        $pages = [];
        foreach ($chunks as $chunk) {
            $block = "[Page {$chunk->page_number}]\n" . trim($chunk->content) . "\n\n";
            if (mb_strlen($text) + mb_strlen($block) > self::MAX_CONTEXT_CHARS) {
                break;
            }
            $text .= $block;
            $pages[(int) $chunk->page_number] = true;
        }

        return [$text, array_keys($pages)];
    }

    private function prompt(Document $document, array $data, string $context): string
    {
        $type = self::TYPES[$data['type']];
        $topic = filled($data['topic'] ?? null) ? "Thème à privilégier : {$data['topic']}.\n" : '';
        $level = filled($data['level'] ?? null) ? "Niveau des étudiants : {$data['level']}.\n" : '';
        $shape = match ($data['type']) {
            'qcm' => '{"question": "...", "choices": ["...", "...", "...", "..."], "answer": 0, "explanation": "...", "page": 12}  // answer = index (0 à 3) du bon choix',
            'vrai_faux' => '{"question": "affirmation ...", "answer": true, "explanation": "...", "page": 12}',
            default => '{"question": "...", "answer": "réponse attendue en une ou deux phrases", "page": 12}',
        };

        return <<<PROMPT
Tu es un enseignant universitaire. Rédige {$data['count']} {$type} en français pour réviser le document « {$document->title} ».
{$level}{$topic}Règles :
- Utilise UNIQUEMENT le contenu des extraits ci-dessous, jamais tes connaissances générales.
- Chaque question indique la page d'où elle vient (numéro donné par [Page N]).
- Questions variées, claires, sans ambiguïté ; les mauvais choix d'un QCM doivent être plausibles.
- Réponds uniquement en JSON : {"questions": [ {$shape} ]}

Extraits du document :
{$context}
PROMPT;
    }

    /** Questions valides uniquement (forme attendue, page présente dans les extraits fournis). */
    private function parse(string $raw, string $type, array $pages): array
    {
        $raw = trim(preg_replace('/^```(?:json)?|```$/m', '', trim($raw)));
        $json = json_decode($raw, true);
        $items = is_array($json) ? ($json['questions'] ?? (array_is_list($json) ? $json : [])) : [];

        $clean = [];
        foreach ($items as $q) {
            if (!is_array($q) || !filled($q['question'] ?? null)) {
                continue;
            }
            $page = isset($q['page']) && in_array((int) $q['page'], $pages, true) ? (int) $q['page'] : null;
            $item = ['question' => trim((string) $q['question']), 'page' => $page, 'explanation' => isset($q['explanation']) ? trim((string) $q['explanation']) : null];

            if ($type === 'qcm') {
                $choices = array_values(array_filter(array_map(fn ($c) => trim((string) $c), (array) ($q['choices'] ?? [])), 'strlen'));
                $answer = (int) ($q['answer'] ?? -1);
                if (count($choices) < 2 || $answer < 0 || $answer >= count($choices)) {
                    continue;
                }
                $item += ['choices' => $choices, 'answer' => $answer];
            } elseif ($type === 'vrai_faux') {
                $answer = $q['answer'] ?? null;
                if (is_string($answer)) {
                    $answer = in_array(mb_strtolower($answer), ['true', 'vrai'], true);
                }
                if (!is_bool($answer)) {
                    continue;
                }
                $item += ['answer' => $answer];
            } else {
                if (!filled($q['answer'] ?? null)) {
                    continue;
                }
                $item += ['answer' => trim((string) $q['answer'])];
            }
            $clean[] = $item;
        }

        return $clean;
    }
}
