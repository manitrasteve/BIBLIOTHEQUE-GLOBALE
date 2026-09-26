<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CategoryController extends Controller
{
    public function index()
    {
        return response()->json(Category::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        // Le slug est unique en base : un doublon (« Droit » / « droit ») provoquait une erreur 500.
        if (Category::where('slug', Str::slug($data['name']))->exists()) {
            throw ValidationException::withMessages(['name' => ['Cette catégorie existe déjà.']]);
        }

        return response()->json(Category::create($data), 201);
    }

    public function update(Request $request, Category $category)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $category->update($data);

        return response()->json($category);
    }

    public function destroy(Category $category)
    {
        // La clé étrangère documents.category_id est en ON DELETE CASCADE : supprimer la catégorie
        // effacerait définitivement ses documents, sans passer par la Corbeille.
        $documents = Document::withTrashed()->where('category_id', $category->id)->count();
        if ($documents > 0) {
            return response()->json([
                'message' => "Cette catégorie est utilisée par {$documents} document(s) (Corbeille comprise) : elle ne peut pas être supprimée.",
            ], 422);
        }

        $category->delete();

        return response()->json(['message' => 'Catégorie supprimée.']);
    }
}
