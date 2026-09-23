<?php

namespace App\Jobs;

use App\Models\AdminMessage;
use App\Models\AdminMessageRecipient;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

/**
 * Envoie un message groupé (admin/bibliothécaire → utilisateurs) en tâche de
 * fond : chaque destinataire représente un appel SMTP bloquant, bien trop
 * long pour la requête HTTP du bouton "Envoyer" dès que la liste dépasse
 * quelques utilisateurs.
 */
class SendAdminBroadcastJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 600;

    /** @param array<int, int> $userIds */
    public function __construct(
        public readonly AdminMessage $message,
        public readonly array $userIds,
    ) {
    }

    public function handle(): void
    {
        $ok = 0;
        $fail = 0;

        foreach (User::whereIn('id', $this->userIds)->get() as $user) {
            $status = 'envoye';
            $error = null;

            try {
                Mail::send('emails.notice', [
                    'heading' => $this->message->subject,
                    'paragraphs' => array_merge(
                        ['Bonjour ' . $user->name . ','],
                        preg_split('/\R{2,}/', trim($this->message->message))
                    ),
                ], fn ($mail) => $mail
                    ->to($user->email)
                    ->subject($this->message->subject));
                $ok++;
            } catch (\Throwable $e) {
                $status = 'echec';
                $error = $e->getMessage();
                $fail++;
            }

            AdminMessageRecipient::create([
                'admin_message_id' => $this->message->id,
                'user_id' => $user->id,
                'email' => $user->email,
                'status' => $status,
                'error' => $error,
            ]);

            NotificationService::send(
                $user,
                'message_admin',
                $this->message->subject,
                $this->message->message,
                $this->message
            );
        }

        $this->message->update(['success_count' => $ok, 'failure_count' => $fail]);
    }
}
