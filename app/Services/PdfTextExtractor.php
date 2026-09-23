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
            $text = trim($this->sanitizeUtf8($page->getText()));
            if ($text !== '') {
                $pages[$index + 1] = $text;
            }
        }

        return $pages;
    }

    /**
     * Certains PDF (police CID corrompue, ligature mal mappée…) font
     * ressortir des octets UTF-8 invalides du parseur. Non nettoyés, ils
     * cassent le json_encode des appels Gemini (embeddings, RAG) bien plus
     * tard, avec un message d'erreur qui ne pointe plus vers le PDF en cause.
     */
    private function sanitizeUtf8(string $text): string
    {
        if ($text === '' || mb_check_encoding($text, 'UTF-8')) {
            return $text;
        }

        $clean = @iconv('UTF-8', 'UTF-8//IGNORE', $text);

        return $clean !== false ? $clean : mb_convert_encoding($text, 'UTF-8', 'UTF-8');
    }
}
