<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Rules\AvailableEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json($request->user()->load('library'));
    }

    public function update(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'email' => ['required','email','max:255', new AvailableEmail($user->id)],
            'phone' => ['nullable','string','max:50'],
            'address' => ['nullable','string','max:255'],
            'date_of_birth' => ['nullable','date'],
            'photo' => ['nullable','image','mimes:jpg,jpeg,png,webp','max:2048'],
            'school' => ['nullable','string','max:255'], 'filiere'=>['nullable','string','max:255'],
            'niveau_type'=>['nullable','string','max:50'], 'niveau_detail'=>['nullable','string','max:80'],
            'faculty'=>['nullable','string','max:255'], 'department'=>['nullable','string','max:255'],
            'position'=>['nullable','string','max:255'], 'teaching_specialty'=>['nullable','string','max:255'],
            'specialty'=>['nullable','string','max:255'], 'diploma'=>['nullable','string','max:255'],
            'workplace'=>['nullable','string','max:255'], 'researcher_field'=>['nullable','string','max:255'],
            'profession'=>['nullable','string','max:255'], 'experience'=>['nullable','string','max:2000'],
        ]);
        unset($data['photo']);
        if ($request->hasFile('photo')) {
            if ($user->photo_path) Storage::disk('public')->delete($user->photo_path);
            $data['photo_path'] = $request->file('photo')->store('profiles','public');
        }
        $user->update($data);
        return response()->json($user->fresh()->load('library'));
    }

    // Profil lecteur : chiffres de lecture et catégories les plus consultées (données réelles uniquement).
    public function readingStats(Request $request)
    {
        $user = $request->user();

        $topCategories = \App\Models\Consultation::query()
            ->where('consultations.user_id', $user->id)
            ->join('documents', 'documents.id', '=', 'consultations.document_id')
            ->join('categories', 'categories.id', '=', 'documents.category_id')
            ->selectRaw('categories.name AS name, COUNT(DISTINCT consultations.document_id) AS documents')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('documents')
            ->orderBy('categories.name')
            ->limit(5)
            ->get()
            ->map(fn ($row) => ['name' => $row->name, 'documents' => (int) $row->documents]);

        return response()->json([
            'documents_read' => $user->consultations()->distinct()->count('document_id'),
            'consultations' => $user->consultations()->count(),
            'pages_reached' => (int) \App\Models\ReadingProgress::where('user_id', $user->id)->sum('last_page'),
            'notes' => \App\Models\DocumentNote::where('user_id', $user->id)->count(),
            'favorites' => $user->favorites()->count(),
            'ai_queries' => $user->aiQueries()->count(),
            'top_categories' => $topCategories,
            'member_since' => $user->created_at,
        ]);
    }

    public function deletePhoto(Request $request)
    {
        $user = $request->user();
        if ($user->photo_path) Storage::disk('public')->delete($user->photo_path);
        $user->update(['photo_path'=>null]);
        return response()->json($user->fresh());
    }
}
