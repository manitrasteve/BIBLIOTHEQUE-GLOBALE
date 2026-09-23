<?php

namespace App\Jobs;

use App\Models\Document;
use App\Services\DocumentIngestionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Lance l'indexation RAG (extraction PDF, découpage, embeddings Gemini)
 * en tâche de fond : un mémoire de 200 pages représente des dizaines
 * d'appels séquentiels à Gemini, bien trop long pour la requête HTTP de
 * création/mise à jour du document (l'utilisateur ne doit pas attendre).
 */
class IngestDocumentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    // Un seul essai : ingest() gère déjà ses échecs d'embedding par lot en
    // interne (log + chunks sans embedding plutôt que tout annuler).
    public int $tries = 1;

    // Aligné sur le délai déjà toléré par l'ancien appel synchrone.
    public int $timeout = 600;

    public function __construct(public readonly Document $document)
    {
    }

    public function handle(DocumentIngestionService $ingestionService): void
    {
        $ingestionService->ingest($this->document);
    }
}
