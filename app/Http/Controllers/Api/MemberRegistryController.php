<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MemberRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MemberRegistryController extends Controller
{
    private function authorized(Request $request): bool
    {
        $user = $request->user();
        return $user && ($user->isAdmin() || $user->isLibrarian());
    }

    public function index(Request $request)
    {
        if (!$this->authorized($request)) return response()->json(['message' => 'Accès non autorisé.'], 403);
        $user = $request->user();
        $query = MemberRegistry::with(['library:id,name', 'user:id,name,email,is_active,matricule'])
            ->orderByDesc('id');

        if ($user->isLibrarian()) $query->where('library_id', $user->library_id);
        if ($request->filled('library_id') && $user->isAdmin()) $query->where('library_id', $request->integer('library_id'));
        if ($request->filled('q')) {
            $q = trim($request->string('q'));
            $query->where(function ($w) use ($q) {
                $w->where('card_number', 'like', "%{$q}%")
                  ->orWhere('last_name', 'like', "%{$q}%")
                  ->orWhere('first_name', 'like', "%{$q}%")
                  ->orWhere('email', 'like', "%{$q}%")
                  ->orWhere('matricule', 'like', "%{$q}%");
            });
        }
        return response()->json($query->paginate(30));
    }

    public function import(Request $request)
    {
        if (!$this->authorized($request)) return response()->json(['message' => 'Accès non autorisé.'], 403);
        $user = $request->user();
        $validated = $request->validate([
            'library_id' => ['required','integer','exists:libraries,id'],
            'file' => ['required','file','mimes:csv,txt','max:10240'],
        ]);
        if ($user->isLibrarian() && (int)$validated['library_id'] !== (int)$user->library_id) return response()->json(['message'=>'Vous ne pouvez importer que dans votre bibliothèque.'],403);

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        if (!$handle) return response()->json(['message'=>'Impossible de lire le fichier.'],422);
        $headers = fgetcsv($handle, 0, ',');
        $headers = array_map(fn($v)=>Str::of((string)$v)->lower()->ascii()->replace([' ','-'], '_')->value(), $headers ?: []);
        $aliases = ['numero_carte'=>'card_number','num_carte'=>'card_number','card_number'=>'card_number','nom'=>'last_name','prenom'=>'first_name','prénom'=>'first_name','email'=>'email','telephone'=>'phone','téléphone'=>'phone','adresse'=>'address','genre'=>'gender'];
        $headers = array_map(fn($h)=>$aliases[$h] ?? $h, $headers);
        if (!in_array('card_number',$headers,true) || !in_array('last_name',$headers,true)) { fclose($handle); return response()->json(['message'=>'Le CSV doit contenir au minimum numero_carte/card_number et nom/last_name.'],422); }

        $seen=[]; $rows=[]; $existing=0; $errors=[]; $line=1;
        while (($row=fgetcsv($handle,0,','))!==false) {
            $line++; $data=[]; foreach($headers as $i=>$h) $data[$h]=isset($row[$i])?trim((string)$row[$i]):null;
            $card=$data['card_number']??'';
            if ($card==='') { $errors[]=['line'=>$line,'message'=>'Numéro de carte manquant.']; continue; }
            $key=strtolower($card); if(isset($seen[$key])) continue; $seen[$key]=true;
            if(MemberRegistry::where('library_id',$validated['library_id'])->where('card_number',$card)->exists()){ $existing++; continue; }
            $rows[]=['library_id'=>$validated['library_id'],'card_number'=>$card,'last_name'=>$data['last_name']??'','first_name'=>$data['first_name']??null,'email'=>$data['email']??null,'phone'=>$data['phone']??null,'address'=>$data['address']??null,'gender'=>$data['gender']??null,'role'=>'etudiant','status'=>'actif','profile_data'=>json_encode([]),'created_at'=>now(),'updated_at'=>now()];
        }
        fclose($handle);
        if($errors) return response()->json(['message'=>'Import refusé : certaines lignes sont invalides.','errors'=>$errors],422);
        DB::transaction(fn()=>MemberRegistry::insert($rows));
        return response()->json(['message'=>'Import terminé.','added'=>count($rows),'existing'=>$existing,'duplicates_removed'=>count($seen)-count($rows)-$existing,'errors'=>0],201);
    }
}
