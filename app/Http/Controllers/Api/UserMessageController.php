<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminMessageRecipient;
use App\Support\LocalTimeFilter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserMessageController extends Controller
{
    public function index(Request $request)
    {
        // Recherche et filtres de la boîte de réception (dates et heures exprimées à l'heure locale).
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'sender_role' => ['nullable', Rule::in(['administrateur', 'bibliothecaire'])],
            ...LocalTimeFilter::rules(),
        ]);

        $query = AdminMessageRecipient::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('deleted_at');

        $this->applyFilters($query, $filters);

        $items = $query
            ->with(['message.sender:id,name,role'])
            ->latest()
            ->orderByDesc('id')
            ->paginate(30);

        return response()->json($items);
    }

    private function applyFilters($query, array $filters): void
    {
        if (filled($filters['search'] ?? null)) {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim($filters['search'])) . '%';
            $query->whereHas('message', fn ($m) => $m->where(fn ($q) => $q
                ->where('subject', 'like', $like)
                ->orWhere('message', 'like', $like)
                ->orWhereHas('sender', fn ($s) => $s->where('name', 'like', $like))));
        }

        if ($role = $filters['sender_role'] ?? null) {
            $roles = $role === 'administrateur' ? ['administrateur', 'admin'] : ['bibliothecaire'];
            $query->whereHas('message.sender', fn ($s) => $s->whereIn('role', $roles));
        }

        // Date, heure et jour de la semaine, à l'heure locale.
        LocalTimeFilter::apply($query, $filters);
    }

    public function markRead(Request $request, AdminMessageRecipient $recipient)
    {
        abort_unless((int) $recipient->user_id === (int) $request->user()->id, 403);
        $recipient->update(['read_at' => now()]);
        return response()->json(['message' => 'Message marqué comme lu.']);
    }

    public function destroy(Request $request, AdminMessageRecipient $recipient)
    {
        abort_unless((int) $recipient->user_id === (int) $request->user()->id, 403);
        $recipient->update(['deleted_at' => now()]);
        return response()->json(['message' => 'Message supprimé.']);
    }

    public function clear(Request $request)
    {
        AdminMessageRecipient::where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->update(['deleted_at' => now()]);

        return response()->json(['message' => 'Tous vos messages ont été supprimés.']);
    }
}
