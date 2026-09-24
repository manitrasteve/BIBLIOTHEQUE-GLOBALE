<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DocumentImportService;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Importation de documents par Excel (Administrateur / Bibliothécaire, mêmes droits que la
 * création d'un document). Aucun document n'est créé ici : la vérification prépare les valeurs
 * du formulaire, puis chaque document est créé par POST /documents (DocumentController::store).
 */
class DocumentImportController extends Controller
{
    public function __construct(private DocumentImportService $imports) {}

    // Modèle Excel à remplir.
    public function template()
    {
        return response($this->imports->template(), 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="modele-import-documents.xlsx"',
            'Cache-Control' => 'no-store',
        ]);
    }

    /*
     * Vérification d'un lot. Seul le fichier Excel est envoyé : les PDF et couvertures restent
     * dans le navigateur (seuls leur nom, leur taille et le contrôle de leur signature sont transmis)
     * et chaque fichier ne sera envoyé qu'une fois, à la création de son document, où il est
     * validé par les règles habituelles (type réel, taille).
     */
    public function analyze(Request $request)
    {
        $request->validate([
            'excel' => ['required', 'file', 'max:10240', function ($attribute, $file, $fail) {
                if (strtolower($file->getClientOriginalExtension()) !== 'xlsx') {
                    $fail('Le fichier doit être un classeur Excel .xlsx (le format CSV n\'est pas accepté).');
                }
            }],
            'pdfs' => ['array', 'max:'.DocumentImportService::MAX_ROWS * 2],
            'pdfs.*.name' => ['required', 'string', 'max:255'],
            'pdfs.*.size' => ['required', 'integer', 'min:0'],
            'pdfs.*.valid' => ['sometimes', 'boolean'],
            'covers' => ['array', 'max:'.DocumentImportService::MAX_ROWS * 2],
            'covers.*.name' => ['required', 'string', 'max:255'],
            'covers.*.size' => ['required', 'integer', 'min:0'],
            'covers.*.valid' => ['sometimes', 'boolean'],
        ], [
            'excel.required' => 'Choisissez le fichier Excel (.xlsx).',
            'excel.max' => 'Le fichier Excel ne doit pas dépasser 10 Mo.',
        ]);

        try {
            return response()->json($this->imports->analyze(
                $request->file('excel')->getRealPath(),
                $request->input('pdfs', []),
                $request->input('covers', []),
            ));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage(), 'errors' => ['excel' => [$e->getMessage()]]], 422);
        }
    }
}
