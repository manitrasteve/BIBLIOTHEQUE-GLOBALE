<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\SiteUpdate;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
class SiteUpdateController extends Controller
{
 public function index(){return response()->json(SiteUpdate::latest('published_on')->latest()->paginate(20));}
 public function store(Request $r){abort_unless($r->user()->isAdmin(),403);$d=$r->validate(['title'=>'required|string|max:255','description'=>'required|string|max:5000','published_on'=>'nullable|date','icon'=>'nullable|string|max:50','image'=>'nullable|image|max:5120']);if($r->hasFile('image'))$d['image_path']=$r->file('image')->store('site-updates','public');unset($d['image']);$u=SiteUpdate::create([...$d,'created_by'=>$r->user()->id,'published_on'=>$d['published_on']??now()->toDateString()]);User::where('is_active',true)->get()->each(fn($user)=>NotificationService::send($user,'mise_a_jour_site','Nouvelle mise à jour',$u->title,$u));return response()->json($u,201);}
 public function show(string $uuid){return response()->json(SiteUpdate::where('uuid',$uuid)->firstOrFail());}
}
