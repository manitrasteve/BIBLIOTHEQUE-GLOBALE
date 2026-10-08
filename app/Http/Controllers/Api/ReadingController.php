<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\DocumentNote;
use App\Models\ReadingProgress;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Lecture personnelle : dernière page lue (« Reprendre la lecture ») et notes par page.
// Tout est propre au lecteur connecté ; le document doit être publié et accessible.
class ReadingController extends Controller
{
    private function readableDocument(Request $request, string $slug): Document
    {
        $document = Document::where('slug', $slug)->where('status', 'publie')->firstOrFail();
        abort_unless($document->isAccessibleBy($request->user()), 403, 'Droits insuffisants pour ce document.');

        return $document;
    }

    public function saveProgress(Request $request, string $slug)
    {
        $document = $this->readableDocument($request, $slug);
        $data = $request->validate([
            'page' => ['required', 'integer', 'min:1', 'max:100000'],
            'total_pages' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);

        $progress = ReadingProgress::firstOrNew(['user_id' => $request->user()->id, 'document_id' => $document->id]);
        $progress->fill([
            'last_page' => min($data['page'], $data['total_pages'] ?? $data['page']),
            'total_pages' => $data['total_pages'] ?? $progress->total_pages,
        ]);
        $progress->save(); // completed_at : voir ReadingProgress::booted()

        return response()->json($progress->only(['last_page', 'total_pages', 'completed_at', 'updated_at']));
    }

    public function notes(Request $request, string $slug)
    {
        $document = $this->readableDocument($request, $slug);

        return response()->json(
            DocumentNote::where('user_id', $request->user()->id)
                ->where('document_id', $document->id)
                ->orderBy('page')
                ->orderBy('created_at')
                ->get()
        );
    }

    public function storeNote(Request $request, string $slug)
    {
        $document = $this->readableDocument($request, $slug);
        $data = $this->validateNote($request);

        $note = DocumentNote::create([
            ...$data,
            'user_id' => $request->user()->id,
            'document_id' => $document->id,
        ]);

        return response()->json($note, 201);
    }

    public function updateNote(Request $request, DocumentNote $note)
    {
        $this->authorizeNote($request, $note);
        $note->update($this->validateNote($request, partial: true));

        return response()->json($note);
    }

    public function destroyNote(Request $request, DocumentNote $note)
    {
        $this->authorizeNote($request, $note);
        $note->delete();

        return response()->json(['message' => 'Note supprimée.']);
    }

    private function authorizeNote(Request $request, DocumentNote $note): void
    {
        // 404 plutôt que 403 : l'existence des notes d'un autre lecteur ne se devine pas.
        abort_unless((int) $note->user_id === (int) $request->user()->id, 404);
    }

    private function validateNote(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'page' => [$required, 'integer', 'min:1', 'max:100000'],
            'body' => [$required, 'string', 'max:5000'],
            'color' => ['sometimes', Rule::in(DocumentNote::COLORS)],
        ]);
    }
}
