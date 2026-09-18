<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffConversation;
use App\Models\StaffMessage;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StaffDiscussionController extends Controller
{
    /**
     * Liste des bibliothécaires disponibles pour une discussion.
     */
    public function librarians(Request $request)
    {
        $this->ensureStaff($request);

        $librarians = User::query()
            ->where('role', 'bibliothecaire')
            ->where('is_active', true)
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'email',
            ]);

        return response()->json([
            'librarians' => $librarians,
        ]);
    }

    /**
     * Récupérer ou créer une conversation Admin ↔ Bibliothécaire.
     */
    public function myConversation(Request $request)
    {
        $this->ensureStaff($request);
        $user = $request->user();

        if ($user->role === 'bibliothecaire') {
            $admin = User::where('role', 'administrateur')->where('is_active', true)->orderBy('id')->first();
            abort_unless($admin, 404, 'Aucun administrateur n’est disponible.');
            $conversation = StaffConversation::firstOrCreate([
                'admin_id' => $admin->id,
                'librarian_id' => $user->id,
            ]);
        } else {
            $librarianId = $request->integer('librarian_id');
            abort_unless($librarianId, 422, 'Choisissez un bibliothécaire.');
            $librarian = User::where('id', $librarianId)->where('role', 'bibliothecaire')->firstOrFail();
            $conversation = StaffConversation::firstOrCreate([
                'admin_id' => $user->id,
                'librarian_id' => $librarian->id,
            ]);
        }

        return response()->json([
            'conversation' => $conversation->load(['admin:id,name,email', 'librarian:id,name,email']),
        ]);
    }

    public function conversation(Request $request, User $librarian)
    {
        $this->ensureStaff($request);

        if ($librarian->role !== 'bibliothecaire') {
            return response()->json([
                'message' => 'Cet utilisateur n’est pas un bibliothécaire.',
            ], 422);
        }

        $admin = $request->user();

        /*
         * Seul un administrateur peut ouvrir une conversation
         * avec n'importe quel bibliothécaire.
         */
        if ($admin->role !== 'administrateur') {
            if ((int) $admin->id !== (int) $librarian->id) {
                /*
                 * Un bibliothécaire ne doit pas pouvoir choisir
                 * un autre bibliothécaire comme destinataire.
                 *
                 * Sa conversation avec l'administration sera
                 * créée automatiquement dans send().
                 */
            }
        }

        $conversation = StaffConversation::firstOrCreate([
            'admin_id' => $admin->role === 'administrateur'
                ? $admin->id
                : User::where('role', 'administrateur')->value('id'),

            'librarian_id' => $librarian->id,
        ]);

        return response()->json([
            'conversation' => $conversation->load([
                'admin:id,name,email',
                'librarian:id,name,email',
            ]),
        ]);
    }

    /**
     * Récupérer les messages d'une conversation.
     */
    public function messages(Request $request, StaffConversation $conversation)
    {
        $this->ensureStaff($request);

        $user = $request->user();

        if (!$this->canAccessConversation($user, $conversation)) {
            return response()->json([
                'message' => 'Accès refusé à cette conversation.',
            ], 403);
        }

        $messages = StaffMessage::query()
            ->where('conversation_id', $conversation->id)
            ->where(function ($query) use ($user) {
                $query->where(function ($inner) use ($user) {
                    $inner->where('sender_id', $user->id)
                        ->whereNull('deleted_by_sender_at');
                })->orWhere(function ($inner) use ($user) {
                    $inner->where('recipient_id', $user->id)
                        ->whereNull('deleted_by_recipient_at');
                });
            })
            ->with([
                'sender:id,name,email,role',
                'recipient:id,name,email,role',
            ])
            ->orderBy('created_at')
            ->get();

        /*
         * Tous les messages reçus non lus deviennent lus.
         */
        StaffMessage::where('conversation_id', $conversation->id)
            ->where('recipient_id', $user->id)
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
            ]);

        return response()->json([
            'conversation' => $conversation->load([
                'admin:id,name,email',
                'librarian:id,name,email',
            ]),
            'messages' => $messages,
        ]);
    }

    /**
     * Envoyer un message.
     */
    public function send(Request $request)
    {
        $this->ensureStaff($request);

        $data = $request->validate([
            'recipient_id' => [
                'required',
                'integer',
                'exists:users,id',
            ],
            'message' => [
                'required',
                'string',
                'max:5000',
            ],
        ]);

        $sender = $request->user();

        $recipient = User::findOrFail($data['recipient_id']);

        /*
         * La discussion est uniquement :
         *
         * Administrateur ↔ Bibliothécaire
         */
        if (!$this->isStaffPair($sender, $recipient)) {
            return response()->json([
                'message' => 'La discussion est réservée aux administrateurs et bibliothécaires.',
            ], 403);
        }

        /*
         * Identifier l'administrateur et le bibliothécaire
         * de la conversation.
         */
        $adminId = $sender->role === 'administrateur'
            ? $sender->id
            : $recipient->id;

        $librarianId = $sender->role === 'bibliothecaire'
            ? $sender->id
            : $recipient->id;

        $conversation = StaffConversation::firstOrCreate([
            'admin_id' => $adminId,
            'librarian_id' => $librarianId,
        ]);

        $message = StaffMessage::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $sender->id,
            'recipient_id' => $recipient->id,
            'message' => trim($data['message']),
        ]);

        $message->load([
            'sender:id,name,email,role',
            'recipient:id,name,email,role',
        ]);

        NotificationService::send(
            $recipient,
            'message_discussion',
            'Nouveau message de discussion',
            $message->message,
            $message
        );

        return response()->json([
            'message' => 'Message envoyé avec succès.',
            'data' => $message,
        ], 201);
    }

    /**
     * Marquer un message comme lu.
     */
    public function markAsRead(
        Request $request,
        StaffMessage $message
    ) {
        $this->ensureStaff($request);

        $user = $request->user();

        if ((int) $message->recipient_id !== (int) $user->id) {
            return response()->json([
                'message' => 'Vous ne pouvez pas modifier ce message.',
            ], 403);
        }

        $message->update([
            'read_at' => now(),
        ]);

        return response()->json([
            'message' => 'Message marqué comme lu.',
        ]);
    }

    /**
     * Supprimer un message uniquement pour soi.
     */
    public function deleteMessage(
        Request $request,
        StaffMessage $message
    ) {
        $this->ensureStaff($request);

        $user = $request->user();

        if (
            (int) $message->sender_id !== (int) $user->id &&
            (int) $message->recipient_id !== (int) $user->id
        ) {
            return response()->json([
                'message' => 'Vous ne pouvez pas supprimer ce message.',
            ], 403);
        }

        if ((int) $message->sender_id === (int) $user->id) {
            $message->update([
                'deleted_by_sender_at' => now(),
            ]);
        } else {
            $message->update([
                'deleted_by_recipient_at' => now(),
            ]);
        }

        /*
         * Si les deux utilisateurs ont supprimé le message,
         * on peut définitivement le supprimer.
         */
        if (
            $message->deleted_by_sender_at &&
            $message->deleted_by_recipient_at
        ) {
            $message->delete();
        }

        return response()->json([
            'message' => 'Message supprimé.',
        ]);
    }

    /**
     * Supprimer tout l'historique de l'utilisateur connecté.
     */
    public function deleteHistory(Request $request)
    {
        $this->ensureStaff($request);

        $user = $request->user();

        DB::transaction(function () use ($user) {

            StaffMessage::where('sender_id', $user->id)
                ->whereNull('deleted_by_sender_at')
                ->update([
                    'deleted_by_sender_at' => now(),
                ]);

            StaffMessage::where('recipient_id', $user->id)
                ->whereNull('deleted_by_recipient_at')
                ->update([
                    'deleted_by_recipient_at' => now(),
                ]);
        });

        return response()->json([
            'message' => 'Historique des discussions supprimé.',
        ]);
    }

    /**
     * Vérifier que l'utilisateur est Admin ou Bibliothécaire.
     */
    private function ensureStaff(Request $request): void
    {
        $user = $request->user();

        abort_unless(
            $user &&
            in_array($user->role, [
                'administrateur',
                'bibliothecaire',
            ], true),
            403,
            'Accès réservé au personnel.'
        );
    }

    /**
     * Vérifier que l'utilisateur peut accéder à la conversation.
     */
    private function canAccessConversation(
        User $user,
        StaffConversation $conversation
    ): bool {
        return
            (int) $conversation->admin_id === (int) $user->id ||
            (int) $conversation->librarian_id === (int) $user->id;
    }

    /**
     * Vérifier que deux utilisateurs forment un couple
     * Admin ↔ Bibliothécaire.
     */
    private function isStaffPair(
        User $sender,
        User $recipient
    ): bool {
        return (
            $sender->role === 'administrateur' &&
            $recipient->role === 'bibliothecaire'
        ) || (
            $sender->role === 'bibliothecaire' &&
            $recipient->role === 'administrateur'
        );
    }
}