<?php

namespace App\Services;

use App\Models\Document;
use App\Models\DocumentChunk;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class RagService
{
    /**
     * Nombre de passages utilisés pour une question ciblée.
     */
    private const TARGETED_TOP_K = 8;

    /**
     * Nombre maximum de passages utilisés pour une question complexe.
     */
    private const COMPLEX_TOP_K = 8;

    /**
     * Nombre maximum de chunks utilisés pour une analyse globale.
     *
     * Le document actuel possède environ 38 chunks réellement textuels.
     * Cette limite permet donc de couvrir pratiquement tout son contenu.
     */
    private const GLOBAL_MAX_CHUNKS = 40;

    /**
     * Seuil minimal de similarité hybride.
     */
    private const MIN_SIMILARITY = 0.25;

    /**
     * Nombre maximum de caractères utilisé pour un contexte.
     *
     * Cette limite évite d'envoyer un contexte excessivement grand
     * à Gemini si un document devient beaucoup plus volumineux.
     */
    private const MAX_CONTEXT_CHARS = 50000;

    /**
     * Phrase exacte utilisée quand l'information n'est pas dans le document.
     */
    public const NOT_FOUND = "Je ne trouve pas cette information dans le document consulté.";

    /**
     * Page actuellement consultée par l'utilisateur (contexte facultatif).
     */
    private ?int $focusPage = null;

    /**
     * Vrai si le calcul d'embedding de la question a échoué (panne réseau
     * ou API) : "aucun passage trouvé" ne doit alors pas être présenté
     * comme "absent du document".
     */
    private bool $embeddingFailed = false;

    public function __construct(
        private readonly GeminiClient $gemini,
    ) {
    }

    /**
     * Point d'entrée principal du RAG (réponse complète, sans flux).
     *
     * $options : history (tours précédents question/answer),
     *            current_page (page ouverte dans le lecteur).
     */
    public function answer(
        Document $document,
        string $question,
        array $options = []
    ): array {
        return $this->run($document, $question, $options, null);
    }

    /**
     * Même chose, mais $onDelta reçoit la réponse au fil de sa génération.
     */
    public function stream(
        Document $document,
        string $question,
        array $options,
        callable $onDelta
    ): array {
        return $this->run($document, $question, $options, $onDelta);
    }

    private function run(
        Document $document,
        string $question,
        array $options,
        ?callable $onDelta
    ): array {
        $plan = $this->prepare($document, $question, $options);

        if (isset($plan['final'])) {
            return $plan['final'];
        }

        if (isset($plan['image'])) {
            return $this->generateImageAnswer($plan['image']);
        }

        $generate = $plan['generate'];

        /*
         * En flux, on n'affiche jamais une page qui n'existe pas dans le
         * contexte : les citations sont validées au fil de l'eau et toute
         * citation encore incomplète est retenue jusqu'au fragment suivant.
         * La réponse finale (finalize) reste la référence.
         */
        $raw = '';
        $emitted = '';
        $safeDelta = $onDelta
            ? function (string $delta) use (&$raw, &$emitted, $onDelta, $generate) {
                $raw .= $delta;

                [$clean] = $this->sanitizeCitations(
                    $this->withoutOpenCitation($raw),
                    $generate['allowed_pages']
                );

                if (
                    strlen($clean) > strlen($emitted)
                    && str_starts_with($clean, $emitted)
                ) {
                    $onDelta(substr($clean, strlen($emitted)));
                    $emitted = $clean;
                }
            }
            : null;

        try {
            $result = $onDelta
                ? $this->gemini->streamContents(
                    $generate['contents'],
                    $safeDelta,
                    ['temperature' => 0.2, 'model' => $generate['model'], 'timeout' => $generate['timeout']]
                )
                : $this->gemini->generateContents(
                    $generate['contents'],
                    ['temperature' => 0.2, 'model' => $generate['model'], 'timeout' => $generate['timeout']]
                );
        } catch (\Throwable $e) {
            report($e);

            return $this->errorResult(
                $e,
                "Le service IA est momentanément indisponible. Réessaie dans un instant."
            );
        }

        $text = trim($result['text']);

        if ($text === '') {
            return $this->errorResult(
                null,
                "Je n'ai pas pu générer une réponse à partir des passages trouvés."
            );
        }

        return $this->finalize($generate, $text, $result['model']);
    }

    /**
     * Prépare la réponse : sélectionne le contexte et décide s'il faut
     * appeler Gemini (clé 'generate'), générer une image (clé 'image') ou
     * répondre directement (clé 'final').
     */
    public function prepare(
        Document $document,
        string $question,
        array $options = []
    ): array {
        $question = trim($question);

        $page = (int) ($options['current_page'] ?? 0);
        $this->focusPage = $page > 0 ? $page : null;
        $this->embeddingFailed = false;

        $history = $this->cleanHistory($options['history'] ?? []);

        if ($question === '') {
            return ['final' => [
                'answer' => 'Veuillez poser une question sur ce document.',
                'sources' => [],
            ]];
        }

        /*
         * ---------------------------------------------------------
         * 1. CHARGEMENT DES CHUNKS
         * ---------------------------------------------------------
         *
         * Tous les chunks du document sont chargés une seule fois.
         *
         * Pour le document actuel, le volume est très faible.
         */
        $chunks = $document->chunks()
            ->whereNotNull('content')
            ->orderBy('page_number')
            ->orderBy('chunk_index')
            ->get();

        /*
         * Demande explicite de génération d'image : fonction distincte
         * de l'analyse d'une image du document.
         */
        if ($this->isImageRequest($question)) {
            return ['image' => [
                'question' => $question,
                'prompt' => $this->imagePrompt(
                    $document,
                    $question,
                    $chunks,
                    $history
                ),
            ]];
        }

        if ($chunks->isEmpty()) {
            return ['final' => [
                'answer' =>
                    "Le contenu de ce document n'est pas encore indexé pour l'assistant IA.",
                'sources' => [],
            ]];
        }

        /*
         * ---------------------------------------------------------
         * 2. QUESTION SUR UNE PAGE PRÉCISE
         * ---------------------------------------------------------
         */
        $pageNumber = $this->extractPageNumber($question);

        if ($pageNumber !== null) {
            $pageChunks = $chunks
                ->filter(
                    fn (DocumentChunk $chunk) =>
                        (int) $chunk->page_number === $pageNumber
                )
                ->sortBy('chunk_index')
                ->values();

            if ($pageChunks->isEmpty()) {
                return ['final' => [
                    'answer' =>
                        "Je n'ai trouvé aucun texte indexé correspondant à la page {$pageNumber} de ce document. "
                        . "Cette page peut être vide, composée uniquement d'une image ou ne pas avoir pu être extraite du PDF.",
                    'sources' => [],
                ]];
            }

            /*
             * Si la page ne contient qu'un numéro, il n'y a pas
             * réellement de contenu textuel exploitable.
             */
            $meaningfulPageChunks = $pageChunks
                ->filter(
                    fn (DocumentChunk $chunk) =>
                        $this->isMeaningfulChunk($chunk)
                )
                ->values();

            if ($meaningfulPageChunks->isEmpty()) {
                /*
                 * Page sans texte exploitable : si la question porte sur un
                 * élément visuel, on laisse le modèle regarder le PDF.
                 */
                if ($this->isVisualQuestion($question)) {
                    return $this->planGeneration(
                        $document,
                        $question,
                        $pageChunks,
                        'page',
                        $history,
                        $pageNumber,
                        true
                    );
                }

                return ['final' => [
                    'answer' =>
                        "La page {$pageNumber} est bien présente dans le document, "
                        . "mais aucun texte exploitable n'a été extrait de cette page. "
                        . "Elle peut contenir principalement une image, une formule ou un tableau.",
                    'sources' => $this->sourcesFor($pageChunks),
                ]];
            }

            /*
             * Demande de contenu brut.
             *
             * Gemini n'est pas appelé inutilement.
             */
            if (
                $this->isContentRequest($question)
                && !$this->isVisualQuestion($question)
            ) {
                return ['final' => [
                    'answer' =>
                        "### Contenu disponible — page {$pageNumber}\n\n"
                        . $this->mergeChunks($meaningfulPageChunks),
                    'sources' => $this->sourcesFor($meaningfulPageChunks),
                ]];
            }

            /*
             * Question concernant uniquement cette page.
             */
            return $this->planGeneration(
                $document,
                $question,
                $meaningfulPageChunks,
                'page',
                $history,
                $pageNumber,
                $this->isVisualQuestion($question)
            );
        }

        /*
         * ---------------------------------------------------------
         * 3. CLASSIFICATION DE LA QUESTION
         * ---------------------------------------------------------
         */
        $questionType = $this->classifyQuestion($question);

        /*
         * ---------------------------------------------------------
         * 4. SÉLECTION DU CONTEXTE
         * ---------------------------------------------------------
         */
        if ($questionType === 'global') {
            /*
             * Une question globale doit couvrir l'ensemble
             * du texte disponible.
             */
            $relevant = $this->selectGlobalContext($chunks);
        } else {
            /*
             * Question ciblée ou complexe.
             */
            $topK = $questionType === 'complex'
                ? self::COMPLEX_TOP_K
                : self::TARGETED_TOP_K;

            $relevant = $this->retrieveRelevantChunks(
                $chunks,
                $this->contextualQuery($question, $history),
                $topK
            );

            /*
             * "Explique cette formule", "que dit ce paragraphe ?" :
             * la page ouverte dans le lecteur passe en priorité, sans
             * pour autant limiter la recherche à cette seule page.
             */
            if ($this->focusPage !== null && $this->isDeictic($question)) {
                $focus = $chunks->filter(
                    fn (DocumentChunk $chunk) =>
                        (int) $chunk->page_number === $this->focusPage
                        && $this->isMeaningfulChunk($chunk)
                );

                $relevant = $relevant->merge($focus)->unique('id')->values();
            }
        }

        $visual = $this->isVisualQuestion($question);

        if ($relevant->isEmpty() && $this->embeddingFailed) {
            return ['final' => $this->errorResult(
                null,
                "La recherche dans le document est momentanément indisponible (service IA injoignable). "
                . "Réessaie dans un instant."
            )];
        }

        if ($relevant->isEmpty() && !$visual) {
            return ['final' => [
                'answer' =>
                    self::NOT_FOUND . " "
                    . "Essaie de reformuler ta question.",
                'sources' => [],
            ]];
        }

        /*
         * ---------------------------------------------------------
         * 5. PLAN DE GÉNÉRATION DE LA RÉPONSE
         * ---------------------------------------------------------
         */
        return $this->planGeneration(
            $document,
            $question,
            $relevant,
            $questionType,
            $history,
            null,
            $visual
        );
    }

    /**
     * Construit la requête Gemini (contexte + prompt + modèle) sans l'envoyer.
     */
    private function planGeneration(
        Document $document,
        string $question,
        Collection $relevant,
        string $questionType,
        array $history = [],
        ?int $pageNumber = null,
        bool $visual = false
    ): array {
        /*
         * On élimine les contenus vides et on ordonne les passages.
         */
        $relevant = $relevant
            ->filter(
                fn (DocumentChunk $chunk) =>
                    $this->isMeaningfulChunk($chunk)
            )
            ->sortBy([
                ['page_number', 'asc'],
                ['chunk_index', 'asc'],
            ])
            ->values();

        if ($relevant->isEmpty() && !$visual) {
            return ['final' => [
                'answer' =>
                    "Aucun contenu textuel exploitable n'a été trouvé dans les passages sélectionnés.",
                'sources' => [],
            ]];
        }

        /*
         * Construction du contexte.
         *
         * On limite également la taille totale du contexte.
         */
        $context = $relevant->isEmpty()
            ? "(Aucun extrait textuel n'a été trouvé pour cette question.)"
            : $this->buildContext($relevant);

        /*
         * Compréhension visuelle : le PDF est réellement joint à la requête
         * uniquement si la question porte sur un élément visuel/une formule.
         */
        $pdfPart = $visual ? $this->pdfPart($document) : null;

        $visualNote = match (true) {
            $pdfPart !== null => "Le PDF complet du document est JOINT à cette requête : tu peux "
                . "analyser ses images, schémas, graphiques, tableaux et formules. "
                . "Les numéros de page sont ceux du lecteur (1re page du PDF = page 1). "
                . "Appuie-toi sur ce que tu vois réellement dans le PDF.",
            $visual => "AUCUN élément visuel n'a pu être fourni au modèle (PDF indisponible ou trop "
                . "volumineux). Tu ne peux pas voir les images, graphiques, tableaux ou formules "
                . "du document : ne prétends pas les avoir analysés et dis-le clairement si la "
                . "question en dépend ; réponds seulement avec le texte des extraits.",
            default => "Aucun élément visuel n'est fourni : seuls les extraits textuels sont disponibles.",
        };

        $historyBlock = $this->historyBlock($history);

        $pageBlock = $this->focusPage !== null
            ? "PAGE ACTUELLEMENT OUVERTE PAR L'UTILISATEUR : {$this->focusPage} "
                . "(donne la priorité à cette page si la question dit « cette page », « ici », « cette formule »… "
                . "mais utilise les autres pages si la question l'exige)."
            : "PAGE ACTUELLEMENT OUVERTE : inconnue.";

        /*
         * Instructions spécifiques selon le type de question.
         */
        $instructions = match ($questionType) {
            'global' => <<<'TXT'
Analyse les passages fournis comme un ensemble.

L'objectif est de répondre à une question portant sur le document
dans sa globalité.

Identifie :
- les grandes parties ;
- les thèmes principaux ;
- les concepts importants ;
- les idées essentielles ;
- les relations entre les différentes parties ;
- les conclusions importantes lorsqu'elles sont présentes.

Pour une synthèse globale, ne te limite pas aux premières pages
ou au premier passage.

Lorsque plusieurs pages parlent du même sujet, regroupe les
informations plutôt que de les répéter inutilement.

Cite les pages importantes dans ta réponse.
TXT,

            'complex' => <<<'TXT'
La question est complexe.

Croise les différents passages fournis avant de répondre.

Lorsque plusieurs parties du document apportent des informations
complémentaires, synthétise-les.

Pour une comparaison :
- identifie les éléments comparés ;
- présente les ressemblances ;
- présente les différences ;
- donne une conclusion uniquement si elle est soutenue par le document.

Si certains éléments nécessaires ne sont pas présents dans les
passages récupérés, indique clairement cette limite.
TXT,

            'page' => <<<'TXT'
La question concerne une page précise.

Réponds uniquement à partir du contenu textuel disponible sur cette page.

Si la page contient plusieurs passages, croise-les avant de répondre.

Ne complète pas avec des informations provenant de connaissances
extérieures.
TXT,

            default => <<<'TXT'
Réponds précisément à la question en utilisant les passages
récupérés.

Identifie d'abord les passages réellement pertinents.

Ne donne pas d'information qui n'est pas soutenue par le document.
TXT,
        };

        /*
         * Prompt principal.
         */
        $prompt = <<<PROMPT
Tu es l'assistant documentaire intelligent de la Bibliothèque Numérique de l'Université de Mahajanga.

DOCUMENT :
« {$document->title} »

TYPE DE QUESTION :
{$questionType}

RÈGLES ABSOLUES :

1. Utilise uniquement les informations présentes dans les extraits du document fournis ci-dessous.

2. N'invente aucune information.

3. N'utilise pas tes connaissances générales pour compléter une information absente du document.

4. Si une information demandée n'est pas suffisamment présente dans les extraits, dis-le explicitement.

5. Ne prétends jamais avoir lu une information qui n'est pas présente dans les extraits.

6. Lorsque plusieurs pages apportent des informations complémentaires, synthétise-les correctement.

7. Cite les pages lorsque cela est pertinent, sous la forme :
   (p. 3)
   ou
   (p. 3, p. 7)

8. Pour une question globale, couvre les différentes parties représentées dans les extraits.

9. Pour une comparaison, présente clairement les ressemblances, différences et conclusions lorsqu'elles sont disponibles.

10. Pour une définition, distingue clairement la définition donnée par le document d'une éventuelle explication pédagogique.

11. Pour un résumé, ne transforme jamais une supposition en fait.

12. Réponds en français.

13. Sois précis, naturel et suffisamment détaillé.

14. Ne répète pas inutilement la question.

15. Si le document ne permet pas de répondre complètement, explique précisément ce qui manque.

16. Si une information semble ambiguë ou incomplète, signale cette incertitude au lieu de l'inventer.

17. Les numéros de page doivent correspondre aux indications [Page X] présentes dans les extraits.

18. Ne cite jamais une page qui n'est pas représentée dans les extraits.

19. Quand l'information est trouvée, commence par « Selon le document, » puis termine par une ligne « Source : page X » (ou « Source : pages X, Y »), avec uniquement de vraies pages.

20. Quand l'information est absente du document, réponds EXACTEMENT « {NOT_FOUND} » (sans citer de page), puis précise brièvement ce qui manque.

21. Formules : écris-les en LaTeX, en ligne avec $...$ ou en bloc avec $$...$$ (jamais en image). Explique chaque variable et l'usage ; si un calcul est demandé, fais-le seulement avec les données disponibles et signale les hypothèses.

22. Tableaux : utilise un tableau Markdown. Listes : utilise des listes Markdown.

23. Distingue ce qui vient du document (« Dans le document : … ») de ton explication pédagogique (« Explication : … ») lorsque tu ajoutes une explication.

24. La conversation précédente sert uniquement à comprendre la question (par exemple « le troisième point ») ; les faits doivent toujours venir des extraits ou du PDF joint.

INSTRUCTIONS SPÉCIFIQUES :

{$instructions}

{$pageBlock}

ÉLÉMENTS VISUELS :
{$visualNote}

{$historyBlock}EXTRAITS DU DOCUMENT :

{$context}

QUESTION DE L'UTILISATEUR :

{$question}

RÉPONSE :
PROMPT;

        $prompt = str_replace('{NOT_FOUND}', self::NOT_FOUND, $prompt);

        $parts = [];

        if ($pdfPart !== null) {
            $parts[] = $pdfPart;
        }

        $parts[] = ['text' => $prompt];

        /*
         * Modèle adapté : rapide pour une question simple, modèle principal
         * pour une analyse globale/complexe ou visuelle.
         */
        $fast = config('services.gemini.fast_model') ?: null;
        $simple = in_array($questionType, ['question', 'page'], true)
            && !$visual
            && $history === [];
        $model = $simple ? $fast : null;

        /*
         * Pages que la réponse a le droit de citer.
         */
        $allowedPages = $relevant->pluck('page_number')->map(fn ($p) => (int) $p)->all();

        if ($pdfPart !== null) {
            $maxPage = max(
                (int) $relevant->max('page_number'),
                (int) $this->focusPage,
                (int) $pageNumber
            );
            $allowedPages = range(1, max(1, $maxPage));
        }

        return ['generate' => [
            'contents' => [['role' => 'user', 'parts' => $parts]],
            'model' => $model,
            // Le PDF joint demande un délai plus long qu'un simple extrait texte.
            'timeout' => $pdfPart !== null ? 100 : 60,
            'relevant' => $relevant,
            'allowed_pages' => array_values(array_unique($allowedPages)),
            'question_type' => $questionType,
            'visual' => $pdfPart !== null,
            'visual_requested' => $visual,
        ]];
    }

    /**
     * Post-traitement d'une réponse Gemini : vérifie les pages citées
     * (aucune fausse page), fixe les sources et signale un "non trouvé".
     */
    private function finalize(array $plan, string $text, string $model): array
    {
        $notFound = str_contains(
            $this->normalize($text),
            $this->normalize('je ne trouve pas cette information dans le document')
        );

        [$text, $cited] = $this->sanitizeCitations($text, $plan['allowed_pages']);

        $sources = $notFound
            ? []
            : $this->sourcesForCited($plan['relevant'], $cited);

        return [
            'answer' => $text,
            'sources' => $sources,
            'meta' => [
                'model' => $model,
                'question_type' => $plan['question_type'],
                'visual' => $plan['visual'],
                'visual_requested' => $plan['visual_requested'],
                'not_found' => $notFound,
            ],
        ];
    }

    /**
     * Supprime les citations de pages qui ne figurent pas dans le contexte
     * réellement fourni au modèle, et retourne les pages valides citées.
     *
     * @return array{0:string,1:int[]}
     */
    public function sanitizeCitations(string $text, array $allowedPages): array
    {
        $allowed = array_flip(array_map('intval', $allowedPages));
        $cited = [];

        $text = preg_replace_callback(
            '/\b(pp?\.|pages?)\s*(\d+(?:\s*(?:,|;|et|-|–)\s*(?:pp?\.\s*|pages?\s*)?\d+)*)/iu',
            function (array $m) use ($allowed, &$cited) {
                preg_match_all('/\d+/', $m[2], $numbers);

                $valid = array_values(array_filter(
                    array_map('intval', $numbers[0]),
                    fn (int $n) => isset($allowed[$n])
                ));

                if ($valid === []) {
                    return '';
                }

                array_push($cited, ...$valid);

                return $m[1] . ' ' . implode(', ', array_unique($valid));
            },
            $text
        ) ?? $text;

        // Nettoie les restes d'une citation supprimée.
        $text = preg_replace('/\(\s*[,;]?\s*\)/u', '', $text) ?? $text;
        $text = preg_replace('/^\s*Sources?\s*:\s*\.?\s*$/miu', '', $text) ?? $text;
        $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;

        return [trim($text), array_values(array_unique($cited))];
    }

    /**
     * Retire de la fin du texte une citation de page encore incomplète
     * ("(p. 2, p", "Source : pages 4,"…) pour ne pas l'afficher avant
     * de pouvoir la valider.
     */
    private function withoutOpenCitation(string $text): string
    {
        // Parenthèse ouverte non refermée sur la fin du texte.
        $open = strrpos($text, '(');

        if ($open !== false && strpos($text, ')', $open) === false && strlen($text) - $open < 60) {
            $text = substr($text, 0, $open);
        }

        // "Source : page 2, 4" / "p. 12 et" / "pages 3-" en fin de texte.
        return preg_replace(
            '/(?:\bsources?\s*:?\s*|\b(?:pp?\.|pages?)\s*)[\d\s,;\-–]*(?:\bet\s*)?(?:\bpp?\.?\s*)?$/iu',
            '',
            $text
        ) ?? $text;
    }

    /**
     * Sources affichées : pages réellement citées si elles existent,
     * sinon tous les passages utilisés.
     */
    private function sourcesForCited(Collection $relevant, array $cited): array
    {
        if ($cited === []) {
            return $this->sourcesFor($relevant);
        }

        $sources = $this->sourcesFor(
            $relevant->filter(
                fn (DocumentChunk $chunk) =>
                    in_array((int) $chunk->page_number, $cited, true)
            )
        );

        $known = array_column($sources, 'page');

        foreach ($cited as $page) {
            if (!in_array($page, $known, true)) {
                $sources[] = ['page' => $page, 'chunk_id' => null, 'excerpt' => ''];
            }
        }

        usort($sources, fn ($a, $b) => $a['page'] <=> $b['page']);

        return $sources;
    }

    /**
     * Résultat d'erreur : l'appelant renvoie une vraie erreur HTTP,
     * jamais une "réponse" qui ressemblerait à du contenu du document.
     */
    private function errorResult(?\Throwable $e, string $message, bool $mapStatus = true): array
    {
        $status = $e instanceof GeminiException ? $e->status() : 0;

        if ($mapStatus) {
            $message = match (true) {
                $status === 429 => "Le quota de l'API Gemini est atteint pour le moment. Réessaie plus tard.",
                $status === 503 => "Le service IA est très sollicité en ce moment. Réessaie dans un instant.",
                default => $message,
            };
        }

        return [
            'answer' => $message,
            'sources' => [],
            'error' => true,
            'status' => $status,
        ];
    }

    /**
     * Prépare le PDF pour l'envoi inline à Gemini (compréhension visuelle).
     * Retourne null si le fichier est absent ou trop volumineux.
     */
    private function pdfPart(Document $document): ?array
    {
        $path = $document->file_path;

        if (
            !$path
            || !str_ends_with(strtolower($path), '.pdf')
            || !Storage::disk('local')->exists($path)
            || Storage::disk('local')->size($path)
                > (int) config('services.gemini.max_inline_pdf_bytes')
        ) {
            return null;
        }

        return ['inlineData' => [
            'mimeType' => 'application/pdf',
            'data' => base64_encode(Storage::disk('local')->get($path)),
        ]];
    }

    /**
     * Génère l'image demandée (fonction distincte de l'analyse d'image).
     */
    private function generateImageAnswer(array $request): array
    {
        try {
            $image = $this->gemini->generateImage($request['prompt']);
        } catch (\Throwable $e) {
            report($e);

            $status = $e instanceof GeminiException ? $e->status() : 0;

            return $this->errorResult(
                $e,
                $status === 429
                    ? "La génération d'images est indisponible : le quota de l'API Gemini pour les images est atteint ou non activé."
                    : "L'image n'a pas pu être générée pour le moment. Réessaie plus tard.",
                false
            );
        }

        return [
            'answer' => ($image['text'] !== '' ? $image['text'] . "\n\n" : '')
                . "_Image générée par l'IA à ta demande : c'est une illustration, pas un extrait du document._",
            'sources' => [],
            'image' => ['mime' => $image['mime'], 'data' => $image['data']],
            'meta' => ['model' => $image['model'], 'generated_image' => true],
        ];
    }

    /**
     * Détecte une demande explicite de création d'image (≠ analyse d'une
     * image du document).
     */
    public function isImageRequest(string $question): bool
    {
        $q = $this->normalize($question);

        return (bool) preg_match(
            '/\b(cree|creer|genere|generer|dessine|dessiner|produis|realise|fabrique|fais|faire|imagine|illustre|montre|donne|propose)\b'
            . '(?:[\s\-]+\w+){0,4}?[\s\-]+(?:un|une|des)\s+(?:\w+\s+){0,2}?'
            . '(image|illustration|schema|dessin|infographie|visuel|diagramme|affiche)\b/u',
            $q
        );
    }

    /**
     * Question sur un élément visuel (figure, graphique, tableau, formule…).
     */
    public function isVisualQuestion(string $question): bool
    {
        return (bool) preg_match(
            '/\b(graphique|courbe|diagramme|schema|figure|image|illustration|photo|tableau|'
            . 'histogramme|carte|legende|dessin|formule|formules|equation|equations|visuel|'
            . 'que montre|que represente|capture)\b/u',
            $this->normalize($question)
        );
    }

    /**
     * Question qui renvoie à l'endroit consulté ("cette page", "ici"…).
     */
    private function isDeictic(string $question): bool
    {
        $q = $this->normalize($question);

        return (bool) preg_match(
            '/\b(cette|ce|cet|ici|celle-ci|celui-ci|ci-dessus|ci-dessous)\b/u',
            $q
        ) && (bool) preg_match(
            '/\b(page|formule|equation|figure|graphique|tableau|schema|image|passage|section|'
            . 'paragraphe|notion|definition|point|partie|chapitre|texte|illustration)\b/u',
            $q
        );
    }

    /**
     * Nettoie l'historique fourni par le client (4 derniers tours,
     * longueurs bornées).
     *
     * @return array<int, array{question:string,answer:string}>
     */
    private function cleanHistory(mixed $history): array
    {
        if (!is_array($history)) {
            return [];
        }

        $clean = [];

        foreach ($history as $turn) {
            if (!is_array($turn)) {
                continue;
            }

            $q = trim((string) ($turn['question'] ?? ''));
            $a = trim((string) ($turn['answer'] ?? ''));

            if ($q !== '' && $a !== '') {
                $clean[] = [
                    'question' => Str::limit($q, 400, '…'),
                    'answer' => Str::limit($a, 1200, '…'),
                ];
            }
        }

        return array_slice($clean, -4);
    }

    private function historyBlock(array $history): string
    {
        if ($history === []) {
            return '';
        }

        $lines = "CONVERSATION PRÉCÉDENTE (contexte uniquement) :\n";

        foreach ($history as $turn) {
            $lines .= "Utilisateur : {$turn['question']}\nAssistant : {$turn['answer']}\n\n";
        }

        return $lines;
    }

    /**
     * Requête de recherche enrichie par le tour précédent quand la question
     * est courte ou fait référence à la réponse précédente.
     */
    private function contextualQuery(string $question, array $history): string
    {
        if ($history === []) {
            return $question;
        }

        $words = count(preg_split('/\s+/u', trim($question), -1, PREG_SPLIT_NO_EMPTY));
        $refers = (bool) preg_match(
            '/\b(le|la|les)\s+(premier|premiere|deuxieme|troisieme|quatrieme|dernier|derniere)\b|'
            . '\b(ce point|cette partie|celui|celle|ceux|plus de details|developpe|detaille|et pour|et aussi)\b/u',
            $this->normalize($question)
        );

        if ($words > 8 && !$refers) {
            return $question;
        }

        $last = end($history);

        return $last['question'] . ' ' . Str::limit($last['answer'], 300, '') . ' ' . $question;
    }

    /**
     * Assemble le texte de plusieurs chunks d'une même page.
     */
    private function mergeChunks(Collection $chunks): string
    {
        return $chunks
            ->sortBy('chunk_index')
            ->map(fn (DocumentChunk $chunk) => trim($chunk->content))
            ->filter()
            ->implode("\n\n");
    }

    /**
     * Prompt de génération d'image, ancré si possible dans le document.
     */
    private function imagePrompt(
        Document $document,
        string $question,
        Collection $chunks,
        array $history
    ): string {
        $context = '';

        try {
            $usable = $chunks->filter(
                fn (DocumentChunk $chunk) => $this->isMeaningfulChunk($chunk)
            )->values();

            if ($usable->isNotEmpty()) {
                $context = Str::limit(
                    $this->buildContext(
                        $this->retrieveRelevantChunks(
                            $usable,
                            $this->contextualQuery($question, $history),
                            3
                        )
                    ),
                    1500,
                    '…'
                );
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return "Crée une illustration pédagogique claire, sobre et lisible (fond clair, peu de texte, "
            . "libellés courts en français si nécessaire).\n\n"
            . "Demande de l'utilisateur : {$question}\n\n"
            . "Document consulté : « {$document->title} »\n"
            . ($context !== '' ? "Contexte tiré du document :\n{$context}\n" : '');
    }

    /**
     * Construit le contexte envoyé à Gemini.
     *
     * Les passages sont organisés par page et chunk.
     */
    private function buildContext(Collection $chunks): string
    {
        $context = '';

        foreach ($chunks as $chunk) {
            $content = trim($chunk->content);

            if ($content === '') {
                continue;
            }

            $piece =
                "[Page {$chunk->page_number}]\n"
                . $content
                . "\n\n---\n\n";

            /*
             * Évite un contexte trop important.
             */
            if (
                Str::length($context) + Str::length($piece)
                > self::MAX_CONTEXT_CHARS
            ) {
                break;
            }

            $context .= $piece;
        }

        return trim($context);
    }

    /**
     * Recherche sémantique + recherche lexicale.
     */
    private function retrieveRelevantChunks(
    Collection $chunks,
    string $question,
    int $topK
): Collection {
    /*
     * ---------------------------------------------------------
     * 1. FILTRAGE DES CHUNKS UTILISABLES
     * ---------------------------------------------------------
     */
    $usableChunks = $chunks
        ->filter(
            fn (DocumentChunk $chunk) =>
                $this->isMeaningfulChunk($chunk)
        )
        ->values();

    if ($usableChunks->isEmpty()) {
        return collect();
    }

    /*
     * ---------------------------------------------------------
     * 2. RECHERCHE SÉMANTIQUE
     * ---------------------------------------------------------
     */
    $semantic = collect();

    try {
        /*
         * L'embedding d'une même question est réutilisé (cache 24 h) :
         * pas d'appel Gemini répété pour une question identique.
         */
        $queryEmbedding = Cache::remember(
            'rag:qemb:' . sha1(mb_strtolower(trim($question))),
            now()->addDay(),
            fn () => $this->gemini->embed($question)
        );

        $semantic = $usableChunks
            ->map(
                function (DocumentChunk $chunk) use ($queryEmbedding) {
                    $embedding = $chunk->embedding ?? [];

                    $chunk->semantic_similarity =
                        empty($embedding)
                            ? 0.0
                            : $this->cosineSimilarity(
                                $queryEmbedding,
                                $embedding
                            );

                    return $chunk;
                }
            )
            ->sortByDesc('semantic_similarity')
            ->values();
    } catch (\Throwable $e) {
        /*
         * Si Gemini embedding échoue, la recherche lexicale
         * reste disponible comme solution de secours.
         */
        $this->embeddingFailed = true;
        report($e);
    }

    /*
     * ---------------------------------------------------------
     * 3. RECHERCHE LEXICALE
     * ---------------------------------------------------------
     */
    $lexical = $this->lexicalRetrieve(
        $usableChunks,
        $question,
        $topK
    );

    /*
     * ---------------------------------------------------------
     * 4. FUSION SÉMANTIQUE + LEXICALE
     * ---------------------------------------------------------
     */
    if ($semantic->isNotEmpty()) {
        $semanticById = $semantic->keyBy('id');
        $lexicalById = $lexical->keyBy('id');

        $ranked = $usableChunks
            ->map(
                function (DocumentChunk $chunk) use (
                    $semanticById,
                    $lexicalById
                ) {
                    $semanticScore =
                        (float) (
                            $semanticById[$chunk->id]
                                ->semantic_similarity
                                ?? 0.0
                        );

                    $lexicalScore =
                        (float) (
                            $lexicalById[$chunk->id]
                                ->lexical_score
                                ?? 0.0
                        );

                    /*
                     * La recherche sémantique reste dominante.
                     */
                    $chunk->hybrid_score =
                        ($semanticScore * 0.75)
                        + ($lexicalScore * 0.25);

                    return $chunk;
                }
            )
            ->sortByDesc('hybrid_score')
            ->values();

        /*
         * -----------------------------------------------------
         * 5. SÉLECTION ADAPTATIVE
         * -----------------------------------------------------
         *
         * On ne prend plus automatiquement tous les topK.
         *
         * Le premier résultat sert de référence.
         * Les résultats trop éloignés du meilleur score
         * sont écartés.
         */
        $bestScore = (float) (
            $ranked->first()->hybrid_score ?? 0.0
        );

        /*
         * Marge minimale par rapport au meilleur résultat.
         *
         * Exemple :
         *
         * meilleur = 0.80
         * seuil relatif = 0.80 * 0.72 = 0.576
         *
         * Un résultat à 0.40 sera donc rejeté.
         */
        $relativeThreshold = max(
            self::MIN_SIMILARITY,
            $bestScore * 0.72
        );

        $selected = $ranked
            ->filter(
                fn (DocumentChunk $chunk) =>
                    (float) $chunk->hybrid_score
                    >= $relativeThreshold
            )
            ->take($topK)
            ->values();

        /*
         * -----------------------------------------------------
         * 6. DIVERSITÉ ET CONTEXTE LOCAL
         * -----------------------------------------------------
         *
         * Lorsque plusieurs chunks provenant de pages proches
         * sont pertinents, on conserve leur contexte.
         *
         * Cela évite de disperser inutilement les résultats
         * dans tout le document.
         */
        if ($selected->isNotEmpty()) {
            $selectedIds = $selected
                ->pluck('id')
                ->flip();

            $expanded = collect();

            foreach ($selected as $chunk) {
                $expanded->push($chunk);

                /*
                 * Cherche un chunk immédiatement voisin dans
                 * le même document.
                 */
                $neighbors = $usableChunks
                    ->filter(
                        function (DocumentChunk $candidate) use ($chunk) {
                            if (
                                $candidate->document_id
                                !== $chunk->document_id
                            ) {
                                return false;
                            }

                            $indexDistance = abs(
                                (int) $candidate->chunk_index
                                - (int) $chunk->chunk_index
                            );

                            return $indexDistance === 1;
                        }
                    )
                    ->sortBy('chunk_index')
                    ->values();

                foreach ($neighbors as $neighbor) {
                    if (
                        $expanded->count() >= $topK
                    ) {
                        break;
                    }

                    if (
                        $selectedIds->has($neighbor->id)
                    ) {
                        continue;
                    }

                    /*
                     * Le voisin doit rester raisonnablement
                     * proche du meilleur score.
                     */
                    $neighborSemantic =
                        (float) (
                            $neighbor->semantic_similarity ?? 0.0
                        );

                    $neighborLexical =
                        (float) (
                            $neighbor->lexical_score ?? 0.0
                        );

                    $neighborScore =
                        ($neighborSemantic * 0.75)
                        + ($neighborLexical * 0.25);

                    if (
                        $neighborScore
                        >= ($relativeThreshold * 0.90)
                    ) {
                        $neighbor->hybrid_score =
                            $neighborScore;

                        $expanded->push($neighbor);
                        $selectedIds->put(
                            $neighbor->id,
                            true
                        );
                    }
                }
            }

            /*
             * On conserve l'ordre de pertinence.
             */
            return $expanded
                ->sortByDesc(
                    fn (DocumentChunk $chunk) =>
                        (float) (
                            $chunk->hybrid_score ?? 0.0
                        )
                )
                ->take($topK)
                ->values();
        }

        /*
         * -----------------------------------------------------
         * FALLBACK
         * -----------------------------------------------------
         */
        return $lexical;
    }

    /*
     * ---------------------------------------------------------
     * FALLBACK LEXICAL
     * ---------------------------------------------------------
     */
    return $lexical;
}

    /**
     * Recherche lexicale.
     */
    private function lexicalRetrieve(
        Collection $chunks,
        string $question,
        int $topK
    ): Collection {
        $terms = $this->keywords($question);

        if (empty($terms)) {
            return $chunks
                ->take($topK)
                ->values();
        }

        return $chunks
            ->map(
                function (DocumentChunk $chunk) use ($terms) {
                    $text = $this->normalize($chunk->content);

                    $occurrences = 0;
                    $matchedTerms = 0;

                    foreach ($terms as $term) {
                        $count = substr_count($text, $term);

                        if ($count > 0) {
                            $matchedTerms++;
                            $occurrences += $count;
                        }
                    }

                    /*
                     * Score lexical normalisé.
                     */
                    $chunk->lexical_score =
                        ($matchedTerms * 0.15)
                        + min($occurrences * 0.02, 0.40);

                    return $chunk;
                }
            )
            ->filter(
                fn (DocumentChunk $chunk) =>
                    $chunk->lexical_score > 0
            )
            ->sortByDesc('lexical_score')
            ->take($topK)
            ->values();
    }

    /**
     * Sélectionne un contexte couvrant l'ensemble du document.
     *
     * Pour un petit document, tous les chunks textuels utiles
     * sont conservés.
     *
     * Pour un document plus grand, les pages sont réparties
     * afin d'éviter que le début du document domine.
     */
    private function selectGlobalContext(Collection $chunks): Collection
    {
        /*
         * Élimination des chunks inutiles :
         *
         * ""
         * "2"
         * "3"
         * "31"
         */
        $meaningfulChunks = $chunks
            ->filter(
                fn (DocumentChunk $chunk) =>
                    $this->isMeaningfulChunk($chunk)
            )
            ->sortBy([
                ['page_number', 'asc'],
                ['chunk_index', 'asc'],
            ])
            ->values();

        if ($meaningfulChunks->isEmpty()) {
            return collect();
        }

        /*
         * Cas idéal :
         *
         * Le document possède moins de chunks utiles que notre
         * limite globale.
         *
         * On conserve alors TOUT le texte disponible.
         */
        if (
            $meaningfulChunks->count()
            <= self::GLOBAL_MAX_CHUNKS
        ) {
            return $meaningfulChunks;
        }

        /*
         * Document plus important :
         * on répartit la sélection entre les différentes pages.
         */
        $pageGroups = $meaningfulChunks
            ->groupBy(
                fn (DocumentChunk $chunk) =>
                    (int) $chunk->page_number
            )
            ->sortKeys();

        $selected = collect();

        $pageCount = $pageGroups->count();

        $targetPages = min(
            self::GLOBAL_MAX_CHUNKS,
            $pageCount
        );

        $step = max(
            1,
            (int) ceil($pageCount / $targetPages)
        );

        foreach (
            $pageGroups->values() as $index => $pageChunks
        ) {
            if (
                $index % $step === 0
                || $index === $pageCount - 1
            ) {
                /*
                 * Premier chunk de la page.
                 */
                $firstChunk = $pageChunks
                    ->sortBy('chunk_index')
                    ->first();

                if ($firstChunk) {
                    $selected->push($firstChunk);
                }
            }
        }

        /*
         * Complète avec les autres chunks.
         */
        if (
            $selected->count()
            < self::GLOBAL_MAX_CHUNKS
        ) {
            $selectedIds = $selected
                ->pluck('id')
                ->flip();

            foreach ($meaningfulChunks as $chunk) {
                if (
                    $selected->count()
                    >= self::GLOBAL_MAX_CHUNKS
                ) {
                    break;
                }

                if (!$selectedIds->has($chunk->id)) {
                    $selected->push($chunk);
                }
            }
        }

        return $selected
            ->sortBy([
                ['page_number', 'asc'],
                ['chunk_index', 'asc'],
            ])
            ->values();
    }

    /**
     * Vérifie si un chunk contient réellement du contenu documentaire.
     */
    private function isMeaningfulChunk(DocumentChunk $chunk): bool
    {
        $content = trim((string) $chunk->content);

        if ($content === '') {
            return false;
        }

        /*
         * Ignore les chunks composés uniquement d'un numéro.
         */
        if (preg_match('/^\d+$/u', $content)) {
            return false;
        }

        /*
         * Évite également les contenus extrêmement courts.
         */
        return Str::length($content) >= 2;
    }

    /**
     * Extrait un numéro de page lorsqu'il est explicitement demandé.
     *
     * Exemples :
     *
     * "Que dit la page 12 ?"
     * "Explique la p. 15"
     * "Montre le contenu de la page 7"
     */
    private function extractPageNumber(string $question): ?int
    {
        $patterns = [
            '/\bpage\s+(\d+)\b/iu',
            '/\bpages?\s+(\d+)\b/iu',
            '/\bp\.\s*(\d+)\b/iu',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $question, $matches)) {
                return (int) $matches[1];
            }
        }

        return null;
    }

    /**
     * Classifie la question.
     */
    private function classifyQuestion(string $question): string
    {
        $q = $this->normalize($question);

        /*
         * ---------------------------------------------------------
         * QUESTIONS GLOBALES
         * ---------------------------------------------------------
         */
        if (
            preg_match(
                '/\b(' .
                'document entier|' .
                'tout le document|' .
                'ensemble du document|' .
                'dans ce document|' .
                'ce document|' .
                'globalement|' .
                'globalite|' .
                'global|' .
                'sujet principal|' .
                'idee principale|' .
                'idée principale|' .
                'themes principaux|' .
                'thèmes principaux|' .
                'grands themes|' .
                'grands thèmes|' .
                'principaux concepts|' .
                'synthese globale|' .
                'synthèse globale|' .
                'vue d ensemble|' .
                'vue d’ensemble' .
                ')\b/u',
                $q
            )
        ) {
            return 'global';
        }

        /*
         * ---------------------------------------------------------
         * RÉSUMÉ / SYNTHÈSE
         * ---------------------------------------------------------
         */
        if (
            preg_match(
                '/\b(' .
                'resume|' .
                'résumé|' .
                'resumer|' .
                'résumer|' .
                'synthese|' .
                'synthèse|' .
                'synthetise|' .
                'synthétise|' .
                'conclusion generale|' .
                'conclusion générale' .
                ')\b/u',
                $q
            )
        ) {
            return 'global';
        }

        /*
         * ---------------------------------------------------------
         * QUESTIONS COMPLEXES
         * ---------------------------------------------------------
         */
        if (
            preg_match(
                '/\b(' .
                'compare|' .
                'comparer|' .
                'comparaison|' .
                'différence|' .
                'difference|' .
                'différences|' .
                'differences|' .
                'explique en détail|' .
                'explique en profondeur|' .
                'détaillé|' .
                'detaille|' .
                'tous les|' .
                'toutes les|' .
                'quels sont les principaux|' .
                'quelles sont les principales' .
                ')\b/u',
                $q
            )
        ) {
            return 'complex';
        }

        /*
         * ---------------------------------------------------------
         * EXPLICATION / DÉFINITION
         * ---------------------------------------------------------
         */
        if (
            preg_match(
                '/\b(' .
                'explique|' .
                'expliquer|' .
                'explication|' .
                'simplement|' .
                'signifie|' .
                'définition|' .
                'definition' .
                ')\b/u',
                $q
            )
        ) {
            return 'question';
        }

        /*
         * ---------------------------------------------------------
         * CHAPITRE / SECTION / PARTIE
         * ---------------------------------------------------------
         */
        if (
            preg_match(
                '/\b(chapitre|section|partie)\b/u',
                $q
            )
        ) {
            return 'complex';
        }

        return 'question';
    }

    /**
     * Détermine si l'utilisateur demande le contenu brut.
     */
    private function isContentRequest(string $question): bool
    {
        $q = $this->normalize($question);

        return (bool) preg_match(
            '/\b(' .
            'montre|' .
            'montrer|' .
            'affiche|' .
            'afficher|' .
            'donne|' .
            'donner|' .
            'contenu|' .
            'texte|' .
            'ecris|' .
            'écris|' .
            'recopie|' .
            'recopier|' .
            'montre moi|' .
            'montre-moi' .
            ')\b/u',
            $q
        );
    }

        /**
     * Normalise un texte pour les recherches lexicales.
     */
    private function normalize(string $text): string
    {
        $text = mb_strtolower($text, 'UTF-8');

        $text = strtr(
            $text,
            [
                'à' => 'a',
                'â' => 'a',
                'ä' => 'a',
                'á' => 'a',
                'ã' => 'a',
                'å' => 'a',

                'ç' => 'c',

                'é' => 'e',
                'è' => 'e',
                'ê' => 'e',
                'ë' => 'e',

                'î' => 'i',
                'ï' => 'i',
                'ì' => 'i',
                'í' => 'i',

                'ô' => 'o',
                'ö' => 'o',
                'ò' => 'o',
                'ó' => 'o',
                'õ' => 'o',

                'ù' => 'u',
                'û' => 'u',
                'ü' => 'u',
                'ú' => 'u',

                'ÿ' => 'y',

                'œ' => 'oe',
                'æ' => 'ae',
            ]
        );

        return $text;
    }


    /**
     * Extraction des mots importants pour la recherche lexicale.
     */
   private function keywords(string $question): array
{
    /*
     * ---------------------------------------------------------
     * MOTS VIDES / MOTS-OUTILS
     * ---------------------------------------------------------
     *
     * Ces mots apportent peu d'information pour la recherche.
     */
    $stopWords = [
        'avec',
        'dans',
        'pour',
        'vous',
        'nous',
        'cette',
        'ce',
        'cet',
        'ces',
        'quel',
        'quelle',
        'quels',
        'quelles',
        'comment',
        'donne',
        'donnez',
        'faire',
        'fait',
        'sont',
        'est',
        'les',
        'des',
        'une',
        'un',
        'du',
        'de',
        'la',
        'le',
        'et',
        'ou',
        'sur',
        'qui',
        'que',
        'quoi',
        'mon',
        'ma',
        'mes',
        'son',
        'sa',
        'ses',
        'page',
        'pages',
        'document',
        'ceci',
        'cela',
        'tous',
        'toutes',
        'peut',
        'peux',
        'etre',
        'être',
        'pourquoi',
        'necessaire',
        'nécessaire',
        'plusieurs',
    ];

    /*
     * ---------------------------------------------------------
     * TERMES TROP GÉNÉRIQUES
     * ---------------------------------------------------------
     *
     * Ils peuvent apparaître dans de nombreux passages
     * d'un document technique sans être réellement
     * discriminants.
     */
    $genericTerms = [
        'systeme',
        'système',
        'temps',
        'reel',
        'réel',
    ];

    /*
     * ---------------------------------------------------------
     * EXTRACTION DES MOTS
     * ---------------------------------------------------------
     */
    $terms = collect(
        preg_split(
            '/[^\pL\pN]+/u',
            $this->normalize($question),
            -1,
            PREG_SPLIT_NO_EMPTY
        )
    )
        ->map(
            fn (string $term) =>
                trim($term)
        )
        ->filter(
            fn (string $term) =>
                Str::length($term) >= 3
                && !in_array(
                    $term,
                    $stopWords,
                    true
                )
                && !in_array(
                    $term,
                    $genericTerms,
                    true
                )
        )
        ->unique()
        ->values();

    /*
     * ---------------------------------------------------------
     * SYNONYMES / VARIANTES TECHNIQUES
     * ---------------------------------------------------------
     *
     * Le vocabulaire de l'utilisateur peut différer
     * légèrement de celui utilisé dans le document.
     *
     * Exemple :
     *
     * "unité d'exécution"
     *        ↓
     * "tâche"
     */
    $expandedTerms = collect();

    foreach ($terms as $term) {
        $expandedTerms->push($term);

        switch ($term) {
            case 'diviser':
            case 'division':
            case 'decomposer':
            case 'décomposer':
                $expandedTerms->push(
                    'tache',
                    'tâche',
                    'taches',
                    'tâches'
                );
                break;

            case 'unite':
            case 'unité':
            case 'unites':
            case 'unités':
                $expandedTerms->push(
                    'tache',
                    'tâche',
                    'taches',
                    'tâches'
                );
                break;

            case 'execution':
            case 'exécution':
                $expandedTerms->push(
                    'tache',
                    'tâche'
                );
                break;

            case 'multitache':
            case 'multitâche':
            case 'multi-tache':
            case 'multi-tâche':
                $expandedTerms->push(
                    'tache',
                    'tâche',
                    'taches',
                    'tâches'
                );
                break;
        }
    }

    return $expandedTerms
        ->map(
            fn (string $term) =>
                $this->normalize($term)
        )
        ->filter(
            fn (string $term) =>
                Str::length($term) >= 3
        )
        ->unique()
        ->values()
        ->all();
}

    /**
     * Prépare les sources affichées à l'utilisateur.
     */
    private function sourcesFor(Collection $chunks): array
    {
        return $chunks
            ->sortBy([
                ['page_number', 'asc'],
                ['chunk_index', 'asc'],
            ])
            ->map(
                fn (DocumentChunk $chunk) => [
                    'page' => (int) $chunk->page_number,
                    'chunk_id' => (int) $chunk->id,
                    'excerpt' => Str::limit(
                        trim($chunk->content),
                        300
                    ),
                ]
            )
            ->values()
            ->all();
    }

    /**
     * Calcul de similarité cosinus.
     */
    private function cosineSimilarity(
        array $a,
        array $b
    ): float {
        if (
            !$a
            || !$b
            || count($a) !== count($b)
        ) {
            return 0.0;
        }

        $dot = 0.0;
        $normA = 0.0;
        $normB = 0.0;

        foreach ($a as $i => $value) {
            $other = $b[$i] ?? null;

            if (
                !is_numeric($value)
                || !is_numeric($other)
            ) {
                return 0.0;
            }

            $dot +=
                (float) $value
                * (float) $other;

            $normA +=
                (float) $value ** 2;

            $normB +=
                (float) $other ** 2;
        }

        return $normA > 0 && $normB > 0
            ? $dot / (
                sqrt($normA)
                * sqrt($normB)
            )
            : 0.0;
    }
}