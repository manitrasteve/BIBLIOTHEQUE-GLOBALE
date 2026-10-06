<?php

namespace App\Jobs;

use App\Models\CourseList;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Notifie les étudiants d'une classe (nouvelle lecture recommandée, rappel), en tâche de fond :
 * une promotion de L1 compte facilement plusieurs centaines d'étudiants.
 * `$onlyUserIds` : sous-ensemble de la classe (rappel aux étudiants qui n'ont pas ouvert le document).
 */
class NotifyCourseListAudienceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 300;

    public function __construct(
        public readonly CourseList $courseList,
        public readonly string $title,
        public readonly string $message,
        public readonly ?array $onlyUserIds = null,
    ) {
    }

    public function handle(): void
    {
        $ids = $this->onlyUserIds ?? $this->courseList->audience()->pluck('id')->all();

        User::whereKey($ids)->each(fn (User $student) => NotificationService::send(
            $student,
            'lecture_recommandee',
            $this->title,
            $this->message,
            $this->courseList,
        ));
    }
}
