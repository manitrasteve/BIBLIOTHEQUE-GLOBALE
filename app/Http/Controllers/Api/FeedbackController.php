<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Feedback;
use App\Services\NotificationService;
use Illuminate\Http\Request;
class FeedbackController extends Controller
{
 public function store(Request $r){$d=$r->validate(['type'=>'required|in:general,suggestion,bug,document,ai,autre','subject'=>'required|string|max:255','message'=>'required|string|max:5000','rating'=>'nullable|integer|min:1|max:5']); $f=Feedback::create([...$d,'user_id'=>$r->user()->id]); NotificationService::sendToRole('administrateur','nouvel_avis','Nouvel avis utilisateur',$d['subject'],$f); return response()->json($f,201);}
 public function index(Request $r){abort_unless($r->user()->isAdmin(),403); return response()->json(Feedback::with('user:id,name,email')->latest()->paginate(20));}
 public function reply(Request $r, Feedback $feedback){abort_unless($r->user()->isAdmin(),403);$d=$r->validate(['reply'=>'required|string|max:5000','status'=>'required|in:nouveau,lu,traite']);$feedback->update(['admin_reply'=>$d['reply'],'status'=>$d['status'],'replied_at'=>now()]);NotificationService::send($feedback->user,'reponse_avis','Réponse à votre avis',$d['reply'],$feedback);return response()->json($feedback);}
 public function destroy(Request $r, Feedback $feedback){abort_unless($r->user()->isAdmin(),403);$feedback->delete();return response()->json(['message'=>'Avis supprimé.']);}
 public function clearAll(Request $r){abort_unless($r->user()->isAdmin(),403);Feedback::query()->delete();return response()->json(['message'=>'Historique des avis vidé.']);}
}
