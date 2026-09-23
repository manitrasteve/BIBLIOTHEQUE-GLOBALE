<?php

namespace App\Jobs;

use App\Models\Document;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Notifie tous les utilisateurs actifs qu'un document vient d'être publié,
 * en tâche de fond : une bibliothèque avec des centaines de membres actifs
 * représente autant d'écritures séquentielles, trop long pour la requête
 * HTTP du bouton "Publier".
 */
class NotifyDocumentPublishedJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 300;

    public function __construct(
        public readonly Document $document,
        public readonly int $excludeUserId,
    ) {
    }

    public function handle(): void
    {
        User::where('is_active', true)
            ->whereKeyNot($this->excludeUserId)
            ->each(fn (User $user) => NotificationService::send(
                $user,
                'document_publie',
                'Nouveau document publié',
                "« {$this->document->title} » vient d'être publié.",
                $this->document
            ));
    }
}
