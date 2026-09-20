<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Library;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class LibraryController extends Controller
{
    // Public : utilisé sur la page d'accueil et l'écran "Créer un compte"
    public function index()
    {
        return response()->json(Library::orderBy('name')->get());
    }

    public function show(Library $library)
    {
        return response()->json($library);
    }

    // Administrateur, ou bibliothécaire ayant la permission « ajouter_bibliotheque » (middleware de route).
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'address' => ['required', 'string', 'max:255'],
            'location' => ['required', 'string', 'max:255'],
            'opening_hours' => ['required', 'string', 'max:255'],
            'opening_days' => ['required', 'string', 'max:255'],
            'map_link' => ['nullable', 'url'],
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        unset($data['photo']);
        $data['photo_path'] = $request->file('photo')->store('libraries', 'public');

        $library = Library::create($data);

        ActivityLogService::log($request->user()->id, 'creation_bibliotheque', $library->name, $library);

        return response()->json($library, 201);
    }

    // Administrateur, ou bibliothécaire ayant la permission « modifier_bibliotheque » (middleware de route).
    public function update(Request $request, Library $library)
    {
        // Un bibliothécaire ne modifie que sa propre bibliothèque (l'administrateur : toutes).
        abort_unless($request->user()->managesLibrary($library->id), 403, 'Vous ne pouvez modifier que votre propre bibliothèque.');

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'address' => ['sometimes', 'required', 'string', 'max:255'],
            'location' => ['sometimes', 'required', 'string', 'max:255'],
            'opening_hours' => ['sometimes', 'required', 'string', 'max:255'],
            'opening_days' => ['sometimes', 'required', 'string', 'max:255'],
            'map_link' => ['nullable', 'url'],
            // Facultative en modification : les anciennes bibliothèques n'ont pas encore de couverture.
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        unset($data['photo']);
        if ($request->hasFile('photo')) {
            if ($library->photo_path) Storage::disk('public')->delete($library->photo_path);
            $data['photo_path'] = $request->file('photo')->store('libraries', 'public');
        }

        $fields = ['name', 'description', 'address', 'location', 'opening_hours', 'opening_days', 'map_link'];
        $before = $library->only($fields);
        $library->update($data);

        // Audit : uniquement les champs réellement modifiés (avant / après).
        $changes = ActivityLogService::diff($before, $library->fresh()->only($fields));
        if ($request->hasFile('photo')) $changes['photo'] = ['before' => null, 'after' => 'image remplacée'];
        if ($changes) {
            ActivityLogService::log($request->user()->id, 'modification_bibliotheque', $library->name, $library, $changes);
        }

        return response()->json($library);
    }

    public function destroy(Request $request, Library $library)
    {
        if ($library->photo_path) Storage::disk('public')->delete($library->photo_path);
        $library->delete();

        ActivityLogService::log($request->user()->id, 'suppression_bibliotheque', $library->name, $library);

        return response()->json(['message' => 'Bibliothèque supprimée.']);
    }
}
