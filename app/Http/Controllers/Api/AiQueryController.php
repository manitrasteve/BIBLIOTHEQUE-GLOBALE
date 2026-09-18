<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiQuery;
use App\Models\Document;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;

class AiQueryController extends Controller
{
    // Pose une question à l'assistant IA sur un document déjà consulté.
    // Branche ici ton service RAG/Gemini existant (voir GUIDE_INSTALLATION.md).
    public function ask(Request $request, string $slug)
    {
       $document = Document::where('slug', $slug)->where('status', 'publie')->firstOrFail();
        $user = $request->user();

        abort_unless($user, 401);
        abort_unless($user->is_active, 403);
        abort_unless($document->isAccessibleBy($user), 403, 'Droits insuffisants pour ce document.');

        $data = $request->validate([
            'question' => ['required', 'string', 'max:1000'],
        ]);

        // ⚠️ Point d'intégration : remplace cet appel par ton pipeline RAG existant.
        // Exemple attendu : ['answer' => string, 'sources' => [['page' => 12, 'excerpt' => '...'], ...]]
        $result = app(\App\Services\RagService::class)->answer($document, $data['question']);

        $aiQuery = AiQuery::create([
            'user_id' => $user->id,
            'document_id' => $document->id,
            'question' => $data['question'],
            'answer' => $result['answer'],
            'sources' => $result['sources'] ?? [],
        ]);

        ActivityLogService::log($user->id, 'question_ia', $data['question'], $document);

        return response()->json($aiQuery);
    }

    // Historique des questions posées par l'utilisateur sur un document
    public function history(Request $request, string $slug)
    {
        $document = Document::where('slug', $slug)->firstOrFail();

        $queries = AiQuery::where('document_id', $document->id)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at')
            ->get();

        return response()->json($queries);
    }
}