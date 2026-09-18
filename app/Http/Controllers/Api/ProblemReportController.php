<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\ProblemReport;
use App\Services\NotificationService;
use Illuminate\Http\Request;
class ProblemReportController extends Controller
{
 public function store(Request $r){$d=$r->validate(['type'=>'required|in:login,profile,email,password,document,ai,favorites,notifications,display,autre','subject'=>'required|string|max:255','description'=>'required|string|max:5000','screenshot'=>'nullable|image|max:5120']); if($r->hasFile('screenshot')) $d['screenshot_path']=$r->file('screenshot')->store('problem-reports','public'); unset($d['screenshot']); $p=ProblemReport::create([...$d,'user_id'=>$r->user()->id]); NotificationService::sendToRole('administrateur','signalement','Nouveau signalement',$d['subject'],$p); return response()->json($p,201);}
 public function index(Request $r){abort_unless($r->user()->isAdmin(),403);return response()->json(ProblemReport::with('user:id,name,email')->latest()->paginate(20));}
 public function reply(Request $r, ProblemReport $report){abort_unless($r->user()->isAdmin(),403);$d=$r->validate(['reply'=>'required|string|max:5000','status'=>'required|in:nouveau,en_cours,traite']);$report->update(['admin_reply'=>$d['reply'],'status'=>$d['status'],'replied_at'=>now()]);NotificationService::send($report->user,'reponse_signalement','Réponse à votre signalement',$d['reply'],$report);return response()->json($report);}
 public function destroy(Request $r, ProblemReport $report){abort_unless($r->user()->isAdmin(),403);$report->delete();return response()->json(['message'=>'Signalement supprimé.']);}
 public function clearAll(Request $r){abort_unless($r->user()->isAdmin(),403);ProblemReport::query()->delete();return response()->json(['message'=>'Historique des signalements vidé.']);}
}
