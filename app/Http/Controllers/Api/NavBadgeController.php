<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountRequest;
use App\Models\AdminMessageRecipient;
use App\Models\Document;
use App\Models\Feedback;
use App\Models\ProblemReport;
use App\Models\StaffMessage;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Compteurs affichés en badge dans le menu latéral des espaces connectés, en une seule requête.
 * Seules les clés que le compte a le droit de voir sont renvoyées (les autres entrées restent sans badge).
 */
class NavBadgeController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();
        $staff = $user->isAdmin() || $user->isLibrarian();

        $badges = [
            'notifications' => $user->appNotifications()->unread()->count(),
            'messages' => AdminMessageRecipient::where('user_id', $user->id)->whereNull('read_at')->whereNull('deleted_at')->count(),
        ];

        if (!$staff) {
            return response()->json($badges);
        }

        $badges['staff_messages'] = StaffMessage::where('recipient_id', $user->id)
            ->whereNull('read_at')
            ->whereNull('deleted_by_recipient_at')
            ->count();

        // Demandes qui attendent ce compte : vérification (bibliothécaire), vérification ou validation (administrateur).
        // Mêmes exclusions que la liste : lien expiré, compte créé puis mis à la corbeille.
        $badges['account_requests'] = AccountRequest::whereIn('status', $user->isAdmin() ? ['en_attente', 'verifiee'] : ['en_attente'])
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()))
            ->where(fn ($q) => $q->whereNull('created_user_id')->orWhereHas('createdUser'))
            ->count();

        $badges['drafts'] = $user->restrictToManagedLibrary(Document::where('status', 'brouillon'))->count();

        if ($user->hasPermission('voir_avis_utilisateurs')) {
            $badges['feedbacks'] = Feedback::where('status', 'nouveau')->count();
        }
        if ($user->hasPermission('voir_signalements')) {
            $badges['reports'] = ProblemReport::where('status', 'nouveau')->count();
        }
        if ($user->hasPermission('voir_corbeille')) {
            $badges['trash'] = $user->restrictToManagedLibrary(User::onlyTrashed())->count()
                + $user->restrictToManagedLibrary(Document::onlyTrashed())->count();
        }

        return response()->json($badges);
    }
}
