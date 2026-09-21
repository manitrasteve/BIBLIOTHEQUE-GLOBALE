<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Assistant\AssistantAccessException;
use App\Services\Assistant\ManagementAssistantService;
use Illuminate\Http\Request;

// Assistant IA de gestion — ADMINISTRATEUR uniquement (route protégée par role:administrateur,
// et périmètre revérifié par AssistantScope). Aucune bibliothèque ni utilisateur n'est lu dans la requête.
class AdminAssistantController extends Controller
{
    private const TOOL_LABELS = [
        'compter_documents' => 'Comptage des documents',
        'repartition_documents' => 'Répartition des documents',
        'rechercher_documents' => 'Recherche de documents',
        'historique_document' => "Historique d'un document",
        'rechercher_actions' => 'Journal des actions de gestion',
        'rechercher_bibliotheques' => 'Bibliothèques',
        'lister_bibliothecaires' => 'Liste des bibliothécaires',
        'mon_historique' => 'Mon historique',
    ];

    public function ask(Request $request, ManagementAssistantService $assistant)
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:1000'],
            'history' => ['sometimes', 'array', 'max:12'],
            'history.*.role' => ['required', 'in:user,model'],
            'history.*.text' => ['required', 'string', 'max:1500'],
        ]);

        try {
            $result = $assistant->ask($request->user(), $data['question'], $data['history'] ?? []);
        } catch (AssistantAccessException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }

        return response()->json([
            'answer' => $result['answer'],
            'ok' => $result['ok'],
            'model' => $result['model'],
            // Transparence : quelles données réelles ont été consultées (sans les résultats bruts).
            'sources' => collect($result['data'])->map(fn (array $item) => [
                'outil' => $item['outil'],
                'libelle' => self::TOOL_LABELS[$item['outil']] ?? $item['outil'],
                'criteres' => (object) $item['criteres'],
                'total' => $item['resultat']['total'] ?? null,
                'trouve' => $item['resultat']['trouve'] ?? null,
                'hors_perimetre' => $item['resultat']['hors_perimetre'] ?? false,
                'erreur' => $item['resultat']['erreur'] ?? null,
            ])->values()->all(),
        ]);
    }
}
