<?php

namespace App\Services;

use App\Models\Document;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * Transforme un document PDF nouvellement publié en chunks indexés
 * pour la recherche sémantique (RAG) : extraction de texte, découpage,
 * puis calcul et stockage des embeddings Gemini.
 */
class DocumentIngestionService
{
    // Taille cible d'un chunk (en caractères) et chevauchement entre chunks
    // consécutifs, pour ne pas couper une idée au milieu.
    private const CHUNK_SIZE = 1200;
    private const CHUNK_OVERLAP = 200;

    // Nombre de chunks envoyés par requête d'embedding groupée à Gemini.
    private const EMBED_BATCH_SIZE = 20;

    public function __construct(
        private readonly PdfTextExtractor $extractor,
        private readonly GeminiClient $gemini,
    ) {
    }

    /**
     * Ingestion complète d'un document : extrait le texte du PDF stocké,
     * le découpe en chunks, calcule leurs embeddings et les enregistre.
     * Remplace les chunks existants si le document est ré-ingéré.
     */
    public function ingest(Document $document): void
    {
        if (!$document->file_path || !Storage::disk('local')->exists($document->file_path)) {
            Log::warning("Ingestion RAG ignorée : fichier introuvable pour le document #{$document->id}");
            return;
        }

        $absolutePath = Storage::disk('local')->path($document->file_path);

        if (!str_ends_with(strtolower($absolutePath), '.pdf')) {
            // Seuls les PDF sont traités pour le moment (le type le plus courant
            // pour les mémoires/rapports). Les autres formats sont ignorés
            // silencieusement plutôt que de faire échouer l'upload.
            return;
        }

        try {
            $pages = $this->extractor->extractPages($absolutePath);
        } catch (Throwable $e) {
            Log::error("Extraction PDF échouée pour le document #{$document->id} : " . $e->getMessage());
            return;
        }

        if (empty($pages)) {
            Log::warning("Aucun texte extrait du PDF pour le document #{$document->id} (probablement un scan sans OCR).");
            return;
        }

        $chunks = $this->splitIntoChunks($pages);

        if (empty($chunks)) {
            return;
        }

        // Remplace les anciens chunks (utile en cas de ré-ingestion / mise à jour du fichier).
        $document->chunks()->delete();

        foreach (array_chunk($chunks, self::EMBED_BATCH_SIZE, true) as $batch) {
            $texts = array_map(fn (array $c) => $c['content'], $batch);

            try {
                $embeddings = $this->gemini->batchEmbed($texts);
            } catch (Throwable $e) {
                Log::error("Calcul des embeddings Gemini échoué pour le document #{$document->id} : " . $e->getMessage());
                // On continue quand même l'ingestion sans embedding pour ces chunks
                // (ils resteront cherchables par mot-clé, faute de mieux).
                $embeddings = array_fill(0, count($batch), []);
            }

            foreach (array_values($batch) as $i => $chunk) {
                $document->chunks()->create([
                    'page_number' => $chunk['page'],
                    'chunk_index' => $chunk['index'],
                    'content' => $chunk['content'],
                    'embedding' => $embeddings[$i] ?? [],
                ]);
            }
        }
    }

    /**
     * Découpe le texte de chaque page en chunks de taille raisonnable,
     * avec un léger chevauchement pour préserver le contexte.
     *
     * @param  array<int, string>  $pages  texte indexé par numéro de page
     * @return array<int, array{page:int,index:int,content:string}>
     */
    private function splitIntoChunks(array $pages): array
    {
        $chunks = [];
        $globalIndex = 0;

        foreach ($pages as $pageNumber => $text) {
            $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
            $length = Str::length($text);

            if ($length === 0) {
                continue;
            }

            $start = 0;
            while ($start < $length) {
                $end = min($start + self::CHUNK_SIZE, $length);
                $piece = trim(Str::substr($text, $start, $end - $start));

                if ($piece !== '') {
                    $chunks[] = [
                        'page' => $pageNumber,
                        'index' => $globalIndex++,
                        'content' => $piece,
                    ];
                }

                if ($end >= $length) {
                    break;
                }

                $start = $end - self::CHUNK_OVERLAP;
            }
        }

        return $chunks;
    }
}
