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
        $users = User::whereIn('id', $this->userIds)->get();

        // 1) Message interne + notification pour TOUS les destinataires d'abord : ils le voient
        // aussitôt dans l'application. Avant, chaque destinataire attendait les envois SMTP
        // (1 à 3 s chacun) de tous ceux qui le précédaient dans la liste.
        $recipients = [];
        foreach ($users as $user) {
            $recipients[$user->id] = AdminMessageRecipient::create([
                'admin_message_id' => $this->message->id,
                'user_id' => $user->id,
                'email' => $user->email,
                'status' => 'en_attente',
            ]);

            NotificationService::send(
                $user,
                'message_admin',
                $this->message->subject,
                $this->message->message,
                $this->message
            );
        }

        // 2) Copie par e-mail ensuite : le statut de chaque destinataire est mis à jour au fil des envois.
        $ok = 0;
        $fail = 0;

        foreach ($users as $user) {
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

            $recipients[$user->id]->update(['status' => $status, 'error' => $error]);
        }

        $this->message->update(['success_count' => $ok, 'failure_count' => $fail]);
    }
}
