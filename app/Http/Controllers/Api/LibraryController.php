<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Library;
use Illuminate\Http\Request;

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

    // Admin uniquement
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'address' => ['nullable', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
            'opening_hours' => ['nullable', 'string', 'max:255'],
            'opening_days' => ['nullable', 'string', 'max:255'],
            'map_link' => ['nullable', 'url'],
        ]);

        $library = Library::create($data);

        return response()->json($library, 201);
    }

    public function update(Request $request, Library $library)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'address' => ['nullable', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
            'opening_hours' => ['nullable', 'string', 'max:255'],
            'opening_days' => ['nullable', 'string', 'max:255'],
            'map_link' => ['nullable', 'url'],
        ]);

        $library->update($data);

        return response()->json($library);
    }

    public function destroy(Library $library)
    {
        $library->delete();

        return response()->json(['message' => 'Bibliothèque supprimée.']);
    }
}
