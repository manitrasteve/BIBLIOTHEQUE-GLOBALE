<?php

namespace App\Jobs;

use App\Models\SiteUpdate;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Notifie tous les utilisateurs actifs d'une nouvelle actualité du site, en tâche de fond :
 * une notification par compte actif, trop long pour la requête HTTP de publication.
 */
class NotifySiteUpdateJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 300;

    public function __construct(public readonly SiteUpdate $update)
    {
    }

    public function handle(): void
    {
        User::where('is_active', true)
            ->lazyById()
            ->each(fn (User $user) => NotificationService::send(
                $user,
                'mise_a_jour_site',
                'Nouvelle mise à jour',
                $this->update->title,
                $this->update
            ));
    }
}
