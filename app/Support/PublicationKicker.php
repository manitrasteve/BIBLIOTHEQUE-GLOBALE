<?php

namespace App\Support;

use App\Models\Document;
use App\Services\DocumentPublisher;
use Illuminate\Support\Facades\Cache;

/**
 * Publication programmée sans planificateur (même principe que ReminderKicker) : après une requête web,
 * au plus une fois par minute, les documents programmés dont l'heure est passée sont publiés.
 * La réponse est déjà envoyée ; la notification des utilisateurs part en tâche de fond (QueueKicker).
 */
class PublicationKicker
{
    public static function maybeRun(): void
    {
        if (!Cache::add('scheduled-publication-kick', true, now()->addMinute())) {
            return;
        }

        try {
            // Requête légère dans le cas courant : aucun document à publier.
            if (Document::where('status', 'programme')->where('scheduled_at', '<=', now())->exists()) {
                DocumentPublisher::publishDue();
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
