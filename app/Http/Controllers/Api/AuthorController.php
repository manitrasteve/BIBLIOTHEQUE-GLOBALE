<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Author;
use Illuminate\Http\Request;

class AuthorController extends Controller
{
    public function index(Request $request)
    {
        $query = Author::query();

        if ($search = $request->get('search')) {
            $query->where('name', 'like', "%{$search}%");
        }

        // Le sélecteur d'auteurs du formulaire document affiche toute la liste
        // sans pagination visible ; sans ça, les auteurs au-delà du 20e sont
        // silencieusement introuvables (aucun indice qu'il y en a d'autres).
        $perPage = max(1, min((int) $request->get('per_page', 20), 500));

        return response()->json($query->orderBy('name')->paginate($perPage));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:authors,name'],
        ]);

        return response()->json(Author::create($data), 201);
    }

    public function update(Request $request, Author $author)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:authors,name,' . $author->id],
        ]);

        $author->update($data);

        return response()->json($author);
    }

    public function destroy(Author $author)
    {
        $author->delete();

        return response()->json(['message' => 'Auteur supprimé.']);
    }
}
