<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminMessageRecipient;
use Illuminate\Http\Request;

class UserMessageController extends Controller
{
    public function index(Request $request)
    {
        $items = AdminMessageRecipient::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->with(['message.sender:id,name,role'])
            ->latest()
            ->paginate(30);

        return response()->json($items);
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
