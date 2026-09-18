<?php

namespace App\Services;

use Smalot\PdfParser\Parser;

/**
 * Extrait le texte d'un PDF, page par page, pour alimenter le pipeline RAG.
 * Nécessite le package "smalot/pdfparser" (composer require smalot/pdfparser).
 */
class PdfTextExtractor
{
    /**
     * @return array<int, string> texte indexé par numéro de page (1-based)
     */
    public function extractPages(string $absolutePath): array
    {
        $parser = new Parser();
        $pdf = $parser->parseFile($absolutePath);

        $pages = [];
        foreach ($pdf->getPages() as $index => $page) {
            $text = trim($page->getText());
            if ($text !== '') {
                $pages[$index + 1] = $text;
            }
        }

        return $pages;
    }
}
