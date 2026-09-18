<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Document;
use App\Models\StaffMessage;
use App\Models\AdminMessageRecipient;
use Illuminate\Http\Request;
class AppNotificationController extends Controller
{
 public function index(Request $request)
 {
     $items = $request->user()
         ->appNotifications()
         ->orderByDesc('created_at')
         ->paginate(20);

     $items->getCollection()->transform(function ($notification) use ($request) {
         $notification->related_url = null;

         $type = ltrim((string) $notification->related_type, '\\');

         if ($type === 'document' || $type === Document::class) {
             $document = Document::find($notification->related_id);
             if ($document) {
                 $notification->related_url = '/documents/' . $document->slug;
             }
         } elseif ($type === 'App\\Models\\SiteUpdate') {
             $notification->related_url = '/nouveautes';
         } elseif ($type === 'App\\Models\\AccountRequest' ||
                   str_starts_with((string) $notification->type, 'demande_') ||
                   $notification->type === 'compte_a_valider') {
             $notification->related_url = $request->user()->isLibrarian() ? '/bibliothecaire/tickets-comptes' : '/administrateur/comptes';
         } elseif ($type === 'App\\Models\\Feedback' ||
                   $notification->type === 'nouvel_avis') {
             $notification->related_url = '/administrateur/avis';
         } elseif ($type === 'App\\Models\\ProblemReport' ||
                   $notification->type === 'signalement') {
             $notification->related_url = '/administrateur/signalements';
         } elseif ($type === 'App\\Models\\AdminMessage') {
             $notification->related_url = $request->user()->isAdmin() ? '/administrateur/messages' : '/bibliothecaire/messages';
         } elseif ($type === 'App\\Models\\StaffMessage' || $notification->type === 'message_discussion') {
             $notification->related_url = $request->user()->isAdmin() ? '/administrateur/discussions' : '/bibliothecaire/discussions';
         }

         return $notification;
     });

     return response()->json($items);
 }
 public function unreadCount(Request $request){return response()->json(['count'=>$request->user()->appNotifications()->unread()->count()]);}
 public function markRead(Request $request,AppNotification $appNotification){abort_unless($appNotification->user_id===$request->user()->id,403);$appNotification->markAsRead();return response()->json($appNotification);}
 public function markUnread(Request $request,AppNotification $appNotification){abort_unless($appNotification->user_id===$request->user()->id,403);$appNotification->update(['read_at'=>null]);return response()->json($appNotification);}
 public function markAllRead(Request $request){$request->user()->appNotifications()->unread()->update(['read_at'=>now()]);return response()->json(['message'=>'Toutes les notifications sont marquées comme lues.']);}
}
