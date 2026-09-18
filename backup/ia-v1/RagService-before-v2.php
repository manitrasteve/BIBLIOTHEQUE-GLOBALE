<?php

namespace App\Services;

use App\Models\Document;
use App\Models\DocumentChunk;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class RagService
{
    private const TOP_K = 8;
    private const MIN_SIMILARITY = 0.15;

    public function __construct(
        private readonly GeminiClient $gemini,
    ) {
    }

    public function answer(Document $document, string $question): array
    {
        $question = trim($question);

        if ($question === '') {
            return [
                'answer' => 'Veuillez poser une question sur ce document.',
                'sources' => [],
            ];
        }

        $chunks = $document->chunks()
            ->whereNotNull('content')
            ->orderBy('page_number')
            ->orderBy('chunk_index')
            ->get();

        if ($chunks->isEmpty()) {
            return [
                'answer' => "Le contenu de ce document n'est pas encore indexé pour l'assistant IA.",
                'sources' => [],
            ];
        }

        /*
         * Les demandes de page précise ne doivent pas passer uniquement par
         * une recherche vectorielle : "page 3" est une contrainte structurée.
         * On récupère donc directement les chunks de cette page.
         */
        $pageNumber = $this->extractPageNumber($question);

        if ($pageNumber !== null) {
            $pageChunks = $chunks
                ->filter(fn (DocumentChunk $chunk) => (int) $chunk->page_number === $pageNumber)
                ->sortBy('chunk_index')
                ->values();

            if ($pageChunks->isEmpty()) {
                return [
                    'answer' => "Je n'ai trouvé aucun texte indexé correspondant à la page {$pageNumber} de ce document. Cette page peut être vide, composée uniquement d'une image ou ne pas avoir pu être extraite du PDF.",
                    'sources' => [],
                ];
            }

            $sources = $this->sourcesFor($pageChunks);

            /*
             * Pour "donne-moi le contenu de la page X", restituer le texte
             * extrait directement évite que le modèle reformule ou invente.
             * Gemini reste utilisé pour les demandes de résumé/explication.
             */
            if ($this->isContentRequest($question)) {
                return [
                    'answer' => "### Contenu disponible — page {$pageNumber}\n\n" .
                        $this->mergeChunks($pageChunks),
                    'sources' => $sources,
                ];
            }

            $relevant = $pageChunks;
        } else {
            $relevant = $this->retrieveRelevantChunks($chunks, $question);
        }

        if ($relevant->isEmpty()) {
            return [
                'answer' => "Je n'ai trouvé aucun passage suffisamment pertinent dans ce document pour répondre à cette question. Essaie de reformuler ta question.",
                'sources' => [],
            ];
        }

        $context = $relevant
            ->map(fn (DocumentChunk $chunk) =>
                "[Page {$chunk->page_number}]\n{$chunk->content}"
            )
            ->implode("\n\n---\n\n");

        $questionType = $this->classifyQuestion($question);

        $instructions = match ($questionType) {
            'summary' => "Fais un résumé fidèle et structuré des passages fournis. Ne transforme pas un résumé en informations absentes du document.",
            'explanation' => "Explique les passages fournis avec des mots simples et pédagogiques. Distingue clairement l'explication de ce qui est explicitement écrit.",
            'chapter' => "Réponds au sujet du chapitre ou de la section demandée en t'appuyant uniquement sur les passages récupérés. Si les passages sont incomplets, signale-le.",
            default => "Réponds précisément à la question en utilisant uniquement les passages récupérés.",
        };

        $prompt = <<<PROMPT
Tu es l'assistant documentaire de la Bibliothèque Numérique de l'Université de Mahajanga.

DOCUMENT : « {$document->title} »

RÈGLES STRICTES :
1. Utilise uniquement les extraits fournis ci-dessous.
2. N'invente aucune information et ne complète jamais un passage avec des connaissances extérieures.
3. Si les extraits ne permettent pas de répondre avec certitude, dis clairement que l'information n'a pas été trouvée dans les extraits disponibles.
4. {$instructions}
5. Réponds en français, de façon naturelle, précise et suffisamment détaillée.
6. Quand c'est pertinent, cite les pages sous la forme « (p. X) ».
7. Ne dis jamais qu'une page contient quelque chose simplement parce que son numéro est mentionné : lis réellement son contenu.
8. Si plusieurs passages apportent des éléments différents, synthétise-les sans perdre les nuances.
9. Ne prétends pas avoir lu le document entier si seuls certains extraits ont été récupérés.

EXTRAITS DU DOCUMENT :
{$context}

QUESTION DE L'UTILISATEUR :
{$question}

RÉPONSE :
PROMPT;

        try {
            $answer = trim($this->gemini->generate($prompt));
        } catch (\Throwable $e) {
            report($e);
            $answer = "Le service IA est momentanément indisponible. Vérifie la configuration de Gemini et réessaie.";
        }

        if ($answer === '') {
            $answer = "Je n'ai pas pu générer une réponse à partir des passages trouvés.";
        }

        return [
            'answer' => $answer,
            'sources' => $this->sourcesFor($relevant),
        ];
    }

    private function retrieveRelevantChunks(Collection $chunks, string $question): Collection
    {
        try {
            $queryEmbedding = $this->gemini->embed($question);

            $semantic = $chunks
                ->map(function (DocumentChunk $chunk) use ($queryEmbedding) {
                    $embedding = $chunk->embedding ?? [];

                    $chunk->similarity = empty($embedding)
                        ? 0.0
                        : $this->cosineSimilarity($queryEmbedding, $embedding);

                    return $chunk;
                })
                ->sortByDesc('similarity')
                ->take(self::TOP_K)
                ->filter(fn (DocumentChunk $chunk) =>
                    (float) $chunk->similarity >= self::MIN_SIMILARITY
                )
                ->values();

            if ($semantic->isNotEmpty()) {
                return $semantic;
            }
        } catch (\Throwable $e) {
            report($e);
        }

        /*
         * Fallback lexical si Gemini/embeddings sont indisponibles.
         * On conserve toujours la contrainte du document courant car $chunks
         * provient exclusivement de ce document.
         */
        return $this->lexicalRetrieve($chunks, $question);
    }

    private function lexicalRetrieve(Collection $chunks, string $question): Collection
    {
        $terms = $this->keywords($question);

        if (empty($terms)) {
            return $chunks->take(self::TOP_K)->values();
        }

        return $chunks
            ->map(function (DocumentChunk $chunk) use ($terms) {
                $text = $this->normalize($chunk->content);
                $score = 0;

                foreach ($terms as $term) {
                    $score += substr_count($text, $term);
                }

                // Bonus lorsque plusieurs mots de la question apparaissent.
                $matched = 0;
                foreach ($terms as $term) {
                    if (str_contains($text, $term)) {
                        $matched++;
                    }
                }

                $chunk->similarity = $score + ($matched * 2);

                return $chunk;
            })
            ->sortByDesc('similarity')
            ->take(self::TOP_K)
            ->filter(fn (DocumentChunk $chunk) => $chunk->similarity > 0)
            ->values();
    }

    private function extractPageNumber(string $question): ?int
    {
        $patterns = [
            '/\bpages?\s*(?:n[°º.]?\s*)?(\d+)\b/iu',
            '/\bp\.\s*(\d+)\b/iu',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $question, $matches)) {
                $page = (int) $matches[1];

                if ($page > 0) {
                    return $page;
                }
            }
        }

        return null;
    }

    private function isContentRequest(string $question): bool
    {
        $q = $this->normalize($question);

        return (bool) preg_match(
            '/\b(donne|donnez|affiche|afficher|montre|montrez|contenu|texte|ecris|ecrit|recopie|reproduis|reproduire)\b/u',
            $q
        );
    }

    private function classifyQuestion(string $question): string
    {
        $q = $this->normalize($question);

        if (preg_match('/\b(resume|résumé|résumer|resumer|synthese|synthèse|synthétise)\b/u', $q)) {
            return 'summary';
        }

        if (preg_match('/\b(explique|expliquer|explication|simplement)\b/u', $q)) {
            return 'explanation';
        }

        if (preg_match('/\b(chapitre|section|partie)\b/u', $q)) {
            return 'chapter';
        }

        return 'question';
    }

    private function keywords(string $question): array
    {
        $stopWords = [
            'avec', 'dans', 'pour', 'vous', 'nous', 'cette', 'cette', 'quel',
            'quelle', 'quels', 'quelles', 'comment', 'donne', 'donnez',
            'faire', 'fait', 'sont', 'est', 'les', 'des', 'une', 'un', 'du',
            'de', 'la', 'le', 'et', 'ou', 'sur', 'ce', 'ces', 'qui', 'que',
            'quoi', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'page', 'pages',
        ];

        return collect(preg_split('/[^\pL\pN]+/u', $this->normalize($question), -1, PREG_SPLIT_NO_EMPTY))
            ->filter(fn (string $term) =>
                Str::length($term) >= 3 && !in_array($term, $stopWords, true)
            )
            ->unique()
            ->values()
            ->all();
    }

    private function normalize(string $value): string
    {
        return mb_strtolower(trim($value), 'UTF-8');
    }

    private function mergeChunks(Collection $chunks): string
    {
        $result = '';

        foreach ($chunks->sortBy('chunk_index') as $chunk) {
            $content = trim($chunk->content);

            if ($content === '') {
                continue;
            }

            if ($result === '') {
                $result = $content;
                continue;
            }

            $maxOverlap = min(200, Str::length($result), Str::length($content));
            $overlapFound = 0;

            for ($length = $maxOverlap; $length >= 20; $length--) {
                $suffix = Str::substr($result, -$length);
                $prefix = Str::substr($content, 0, $length);

                if ($suffix === $prefix) {
                    $overlapFound = $length;
                    break;
                }
            }

            $result .= "\n\n" . Str::substr($content, $overlapFound);
        }

        return trim($result);
    }

    private function sourcesFor(Collection $chunks): array
    {
        return $chunks
            ->sortBy([
                ['page_number', 'asc'],
                ['chunk_index', 'asc'],
            ])
            ->map(fn (DocumentChunk $chunk) => [
                'page' => (int) $chunk->page_number,
                'chunk_id' => (int) $chunk->id,
                'excerpt' => Str::limit(trim($chunk->content), 300),
            ])
            ->values()
            ->all();
    }

    private function cosineSimilarity(array $a, array $b): float
    {
        if (!$a || !$b || count($a) !== count($b)) {
            return 0.0;
        }

        $dot = 0.0;
        $normA = 0.0;
        $normB = 0.0;

        foreach ($a as $i => $value) {
            $other = $b[$i] ?? null;

            if (!is_numeric($value) || !is_numeric($other)) {
                return 0.0;
            }

            $dot += (float) $value * (float) $other;
            $normA += (float) $value ** 2;
            $normB += (float) $other ** 2;
        }

        return $normA > 0 && $normB > 0
            ? $dot / (sqrt($normA) * sqrt($normB))
            : 0.0;
    }
}
