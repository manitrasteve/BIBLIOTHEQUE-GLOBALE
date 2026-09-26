<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\Favorite;
use App\Models\Consultation;
use App\Models\AiQuery;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use Illuminate\Http\Request;

class EngagementController extends Controller
{
    public function toggleFavorite(Request $request, string $slug)
    {
        $document=Document::where('slug',$slug)->where('status','publie')->firstOrFail();
        $favorite=Favorite::where('user_id',$request->user()->id)->where('document_id',$document->id)->first();
        if($favorite){ $favorite->delete(); $favorited=false; } else { Favorite::create(['user_id'=>$request->user()->id,'document_id'=>$document->id]); $favorited=true; }
        ActivityLogService::log($request->user()->id,$favorited?'ajout_favori':'retrait_favori',$document->title,$document);
        return response()->json(['favorited'=>$favorited,'favorite_count'=>$document->favorites()->count()]);
    }

 public function favorites(Request $request)
    {
        // Uniquement les documents encore publiés : un favori archivé / dépublié ne pourrait plus
        // être ouvert ni retiré (toggleFavorite n'accepte que les documents publiés).
        $favorites = $request->user()->favorites()
            ->whereHas('document', fn ($d) => $d->where('status', 'publie'))
            ->with(['document.authors:id,name', 'document.category:id,name', 'document.library:id,name'])
            ->latest()
            ->paginate(20);

        $favorites->getCollection()->transform(function ($favorite) {
            $d = $favorite->document;

            return [
                'id' => $favorite->id,
                'created_at' => $favorite->created_at,
                'document' => $d ? [
                    'id' => $d->id,
                    'uuid' => $d->uuid,
                    'slug' => $d->slug,
                    'title' => $d->title,
                    'subtitle' => $d->subtitle,
                    'type' => $d->type,
                    'year' => $d->year,
                    'niveau' => $d->niveau,
                    'language' => $d->language,
                    'cover_url' => $d->cover_path ? \Illuminate\Support\Facades\Storage::url($d->cover_path) : null,
                    'authors' => $d->authors->pluck('name'),
                    'category' => $d->category?->name,
                    'library' => $d->library?->name,
                    'access_level' => $d->access_level,
                ] : null,
            ];
        });

        return response()->json($favorites);
    }

    public function stats(Request $request)
    {
        abort_unless($request->user()->hasPermission('voir_popularite'),403);
        // Le bibliothécaire ne voit que les documents (et totaux) de sa bibliothèque.
        $me=$request->user();
        $ofMyLibrary=fn($q)=>$me->isAdmin()?$q:$q->whereHas('document',fn($d)=>$me->restrictToManagedLibrary($d));
        $docs=$me->restrictToManagedLibrary(Document::where('status','publie'))->withCount(['consultations','favorites','aiQueries'])->orderByDesc('consultations_count')->limit(20)->get(['id','slug','title','type','year']);
        return response()->json(['documents'=>$docs,'totals'=>[
            'consultations'=>$ofMyLibrary(Consultation::query())->count(),'favorites'=>$ofMyLibrary(Favorite::query())->count(),'ai_queries'=>$ofMyLibrary(AiQuery::query())->count()
        ]]);
    }

    // ===== Historique personnel (utilisateur connecté, y compris bibliothécaire) =====

    public function myConsultations(Request $request)
    {
        $rows = Consultation::where('user_id', $request->user()->id)
            ->with('document:id,slug,title,type,year')
            ->latest('consulted_at')
            ->paginate(20);

        return response()->json($rows);
    }

    // « Mes lectures » : un document par ligne, avec sa dernière consultation.
    public function myReadings(Request $request)
    {
        $rows = Consultation::where('user_id', $request->user()->id)
            ->selectRaw('document_id, MAX(consulted_at) as last_consulted_at, COUNT(*) as views')
            ->groupBy('document_id')
            ->orderByDesc('last_consulted_at')
            ->paginate(20);

        $documents = Document::with('authors:id,name')
            ->where('status', 'publie')
            ->whereIn('id', $rows->pluck('document_id'))
            ->get()
            ->keyBy('id');

        $rows->setCollection($rows->getCollection()->map(function ($row) use ($documents) {
            $d = $documents->get($row->document_id);

            return $d ? [
                'document_id' => $d->id,
                'slug' => $d->slug,
                'title' => $d->title,
                'type' => $d->type,
                'year' => $d->year,
                'authors' => $d->authors->pluck('name'),
                'last_consulted_at' => $row->last_consulted_at,
                'views' => (int) $row->views,
            ] : null;
        })->filter()->values());

        return response()->json($rows);
    }

    public function myAiQueries(Request $request)
    {
        $rows = AiQuery::where('user_id', $request->user()->id)
            ->with('document:id,slug,title,type,year')
            ->latest()
            ->paginate(20);

        return response()->json($rows);
    }

    // ===== Vue admin : historique de TOUS les utilisateurs =====

    public function adminConsultations(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        $rows = Consultation::with(['document:id,slug,title,type,year', 'user:id,name,email'])
            ->latest('consulted_at')
            ->paginate(25);

        return response()->json($rows);
    }

    public function adminAiQueries(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        $rows = AiQuery::with(['document:id,slug,title,type,year', 'user:id,name,email'])
            ->latest()
            ->paginate(25);

        return response()->json($rows);
    }

    public function adminFavorites(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);
        $rows = Favorite::with(['document:id,slug,title,type,year', 'user:id,name,email'])
            ->latest()
            ->paginate(25);

        return response()->json($rows);
    }
}