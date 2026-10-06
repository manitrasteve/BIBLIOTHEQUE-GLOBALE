<?php

namespace App\Services;

use App\Jobs\NotifyDocumentPublishedJob;
use App\Models\Document;
use App\Support\QueueKicker;

/**
 * Mise en ligne d'un document, partagée par le bouton « Publier » et la publication programmée :
 * statut, journal d'audit et notification des utilisateurs actifs.
 */
class DocumentPublisher
{
    public static function publish(Document $document, ?int $userId): void
    {
        $previousStatus = $document->status;
        $document->update([
            'status' => 'publie',
            'published_at' => now(),
            'scheduled_at' => null,
            'scheduled_by' => null,
        ]);

        self::afterPublish($document, $userId, $previousStatus);
    }

    /**
     * Publie les documents programmés dont l'heure est passée. Chaque document est « réservé » par une
     * mise à jour conditionnelle : deux exécutions simultanées ne le publient (ni ne le notifient) qu'une fois.
     */
    public static function publishDue(): int
    {
        $published = 0;

        Document::where('status', 'programme')
            ->where('scheduled_at', '<=', now())
            ->orderBy('scheduled_at')
            ->get()
            ->each(function (Document $document) use (&$published) {
                $userId = $document->scheduled_by;
                $claimed = Document::whereKey($document->id)
                    ->where('status', 'programme')
                    ->update(['status' => 'publie', 'published_at' => now(), 'scheduled_at' => null, 'scheduled_by' => null]);

                if (!$claimed) {
                    return;
                }

                self::afterPublish($document->fresh(), $userId, 'programme');
                $published++;
            });

        return $published;
    }

    private static function afterPublish(Document $document, ?int $userId, string $previousStatus): void
    {
        ActivityLogService::log(
            $userId,
            'publication_document',
            $document->title,
            $document,
            ['status' => ['before' => $previousStatus, 'after' => 'publie']],
        );

        // Notifie tous les utilisateurs actifs en tâche de fond : une base
        // d'utilisateurs nombreuse rendrait sinon le bouton "Publier" très lent.
        QueueKicker::dispatch(new NotifyDocumentPublishedJob($document, $userId ?? 0));
    }
}
