<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendAdminBroadcastJob;
use App\Models\AdminMessage;
use App\Models\User;
use App\Support\QueueKicker;
use Illuminate\Http\Request;

class AdminMessageController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureSender($request);

        $messages = AdminMessage::withCount('recipients')
            ->with('sender:id,name,role')
            ->where('sender_id', $request->user()->id)
            ->whereNull('deleted_by_sender_at')
            ->latest()
            ->paginate(20);

        return response()->json($messages);
    }

    public function recipients(Request $request)
    {
        $this->ensureSender($request);
        $query = User::where('is_active', true)->whereNotIn('role', ['administrateur', 'bibliothecaire']);
        return response()->json($query->orderBy('name')->get(['id', 'name', 'email', 'role']));
    }

    public function store(Request $request)
    {
        $this->ensureSender($request);

        $data = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string', 'max:10000'],
            'recipient_ids' => ['nullable', 'array'],
            'recipient_ids.*' => ['integer', 'exists:users,id'],
            'send_to_all' => ['nullable', 'boolean'],
        ]);

        $recipientQuery = User::query()->where('is_active', true);
        if ($request->user()->isLibrarian()) {
            $recipientQuery->whereNotIn('role', ['administrateur', 'bibliothecaire']);
        } else {
            $recipientQuery->where('role', '!=', 'administrateur');
        }

        if (!($data['send_to_all'] ?? false)) {
            $recipientQuery->whereIn('id', $data['recipient_ids'] ?? []);
        }

        $users = $recipientQuery->get();
        if ($users->isEmpty()) {
            return response()->json(['message' => 'Sélectionnez au moins un destinataire actif.'], 422);
        }

        $message = AdminMessage::create([
            'sender_id' => $request->user()->id,
            'subject' => trim($data['subject']),
            'message' => trim($data['message']),
            'recipient_count' => $users->count(),
        ]);

        // Envoi (SMTP + notifications) en tâche de fond : un envoi à de
        // nombreux destinataires rendrait sinon le bouton "Envoyer" très lent.
        QueueKicker::dispatch(new SendAdminBroadcastJob($message, $users->pluck('id')->all()));

        return response()->json($message, 201);
    }

    public function destroy(Request $request, AdminMessage $adminMessage)
    {
        $this->ensureSender($request);
        abort_unless((int) $adminMessage->sender_id === (int) $request->user()->id, 403);

        $adminMessage->update(['deleted_by_sender_at' => now()]);

        return response()->json(['message' => 'Message supprimé de votre historique.']);
    }

    public function clearHistory(Request $request)
    {
        $this->ensureSender($request);
        AdminMessage::where('sender_id', $request->user()->id)
            ->whereNull('deleted_by_sender_at')
            ->update(['deleted_by_sender_at' => now()]);

        return response()->json(['message' => 'Votre historique d’envoi a été supprimé.']);
    }

    private function ensureSender(Request $request): void
    {
        abort_unless(
            $request->user() && in_array($request->user()->role, ['administrateur', 'bibliothecaire'], true),
            403
        );
    }
}
