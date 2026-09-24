<?php

namespace App\Support;

use RuntimeException;
use ZipArchive;

/**
 * Lecture / écriture minimales de fichiers Excel .xlsx (Office Open XML), sans dépendance :
 * un .xlsx est une archive zip de fichiers XML, lue avec ZipArchive + SimpleXML.
 *
 * Suffisant pour l'import de documents : première feuille, valeurs texte / nombre,
 * chaînes partagées et chaînes en ligne. Les formules sont lues via leur dernière valeur calculée.
 */
class SimpleXlsx
{
    /** Taille maximale décompressée d'un fichier XML interne (protection contre les « zip bombs »). */
    private const MAX_XML_BYTES = 30 * 1024 * 1024;

    /**
     * Lit la première feuille du classeur.
     *
     * @return array<int, array<int, string>> lignes indexées par leur numéro Excel (1 = première ligne),
     *                                        cellules indexées par colonne (0 = A)
     */
    public static function readFirstSheet(string $path): array
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RuntimeException("Le fichier n'est pas un classeur Excel .xlsx valide.");
        }

        try {
            $sheetPath = self::firstSheetPath($zip);
            $sharedStrings = self::sharedStrings($zip);
            $xml = self::loadXml($zip, $sheetPath);
        } finally {
            $zip->close();
        }

        $rows = [];
        foreach ($xml->sheetData->row ?? [] as $row) {
            $rowNumber = (int) $row['r'];
            foreach ($row->c as $cell) {
                $ref = (string) $cell['r'];
                $column = self::columnIndex(preg_replace('/\d+/', '', $ref));
                $rowNumber = $rowNumber ?: (int) preg_replace('/\D+/', '', $ref);
                $value = self::cellValue($cell, $sharedStrings);
                if ($value !== '') {
                    $rows[$rowNumber][$column] = $value;
                }
            }
        }

        ksort($rows);

        return $rows;
    }

    /**
     * Génère un classeur .xlsx.
     *
     * @param array<int, array{
     *     name: string,
     *     rows: array<int, array<int, string>>,
     *     widths?: array<int, int>,
     *     header?: bool,
     *     textColumns?: array<int, int>,
     *     validations?: array<int, array{column: int, source: string, strict: bool}>
     * }> $sheets
     */
    public static function build(array $sheets): string
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);

        $sheetEntries = '';
        $relEntries = '';
        $overrides = '';
        foreach (array_values($sheets) as $i => $sheet) {
            $n = $i + 1;
            $sheetEntries .= '<sheet name="'.self::esc($sheet['name']).'" sheetId="'.$n.'" r:id="rId'.$n.'"/>';
            $relEntries .= '<Relationship Id="rId'.$n.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$n.'.xml"/>';
            $overrides .= '<Override PartName="/xl/worksheets/sheet'.$n.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $zip->addFromString("xl/worksheets/sheet{$n}.xml", self::sheetXml($sheet));
        }
        $stylesRel = count($sheets) + 1;

        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .$overrides.'</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheets>'.$sheetEntries.'</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$relEntries
            .'<Relationship Id="rId'.$stylesRel.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            .'</Relationships>');
        // Styles : 0 = normal, 1 = en-tête (gras, fond marine, texte blanc), 2 = texte (@, pour ISBN), 3 = en-tête de colonne secondaire.
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
            .'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>'
            .'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="3">'
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            .'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
            .'<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
            .'</cellXfs></styleSheet>');
        $zip->close();

        $content = file_get_contents($path);
        @unlink($path);

        return $content;
    }

    /** Index de colonne (0 = A) → lettres (A, B, …, AA). */
    public static function columnLetter(int $index): string
    {
        $letters = '';
        for ($n = $index + 1; $n > 0; $n = intdiv($n - 1, 26)) {
            $letters = chr(65 + ($n - 1) % 26).$letters;
        }

        return $letters;
    }

    private static function sheetXml(array $sheet): string
    {
        $header = $sheet['header'] ?? false;
        $textColumns = array_flip($sheet['textColumns'] ?? []);
        $maxRows = max(count($sheet['rows']), 1) + 500; // cellules « texte » préformatées pour la saisie

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
        if ($header) {
            $xml .= '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
        }
        if (! empty($sheet['widths'])) {
            $xml .= '<cols>';
            foreach ($sheet['widths'] as $i => $width) {
                $style = isset($textColumns[$i]) ? ' style="2"' : '';
                $xml .= '<col min="'.($i + 1).'" max="'.($i + 1).'" width="'.$width.'" customWidth="1"'.$style.'/>';
            }
            $xml .= '</cols>';
        }

        $xml .= '<sheetData>';
        foreach (array_values($sheet['rows']) as $r => $cells) {
            $rowNumber = $r + 1;
            $xml .= '<row r="'.$rowNumber.'">';
            foreach (array_values($cells) as $c => $value) {
                $ref = self::columnLetter($c).$rowNumber;
                $style = $header && $r === 0 ? ' s="1"' : (isset($textColumns[$c]) ? ' s="2"' : '');
                $xml .= '<c r="'.$ref.'" t="inlineStr"'.$style.'><is><t xml:space="preserve">'.self::esc((string) $value).'</t></is></c>';
            }
            $xml .= '</row>';
        }
        $xml .= '</sheetData>';

        if (! empty($sheet['validations'])) {
            $xml .= '<dataValidations count="'.count($sheet['validations']).'">';
            foreach ($sheet['validations'] as $v) {
                $col = self::columnLetter($v['column']);
                // strict = liste fermée ; sinon simple suggestion (une autre valeur reste acceptée).
                $attrs = $v['strict'] ? 'showErrorMessage="1"' : 'errorStyle="information" showErrorMessage="0"';
                $xml .= '<dataValidation type="list" allowBlank="1" showInputMessage="1" '.$attrs.' sqref="'.$col.'2:'.$col.$maxRows.'">'
                    .'<formula1>'.self::esc($v['source']).'</formula1></dataValidation>';
            }
            $xml .= '</dataValidations>';
        }

        return $xml.'</worksheet>';
    }

    private static function firstSheetPath(ZipArchive $zip): string
    {
        $workbook = self::loadXml($zip, 'xl/workbook.xml');
        $first = $workbook->sheets->sheet[0] ?? null;
        if (! $first) {
            throw new RuntimeException('Le classeur ne contient aucune feuille.');
        }

        $relId = (string) $first->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
        $rels = self::loadXml($zip, 'xl/_rels/workbook.xml.rels');
        foreach ($rels->Relationship as $rel) {
            if ((string) $rel['Id'] === $relId) {
                $target = ltrim((string) $rel['Target'], '/');

                return str_starts_with($target, 'xl/') ? $target : 'xl/'.$target;
            }
        }

        throw new RuntimeException('La première feuille du classeur est illisible.');
    }

    private static function sharedStrings(ZipArchive $zip): array
    {
        if ($zip->locateName('xl/sharedStrings.xml') === false) {
            return [];
        }

        $strings = [];
        foreach (self::loadXml($zip, 'xl/sharedStrings.xml')->si as $si) {
            $strings[] = self::inlineText($si);
        }

        return $strings;
    }

    private static function cellValue(\SimpleXMLElement $cell, array $sharedStrings): string
    {
        $type = (string) $cell['t'];
        $value = match ($type) {
            's' => $sharedStrings[(int) $cell->v] ?? '',
            'inlineStr' => self::inlineText($cell->is),
            'b' => ((string) $cell->v) === '1' ? 'VRAI' : 'FAUX',
            default => (string) $cell->v,
        };

        // Nombres : 2019.0 → 2019 ; 9.7821E+12 → 9782100000000 (ISBN saisi comme nombre).
        if (($type === '' || $type === 'n') && is_numeric($value)) {
            $number = (float) $value;
            if (floor($number) === $number && abs($number) < 1e15) {
                $value = number_format($number, 0, '', '');
            }
        }

        return trim(preg_replace('/\s+/u', ' ', $value));
    }

    private static function inlineText(?\SimpleXMLElement $node): string
    {
        if (! $node) {
            return '';
        }
        if (isset($node->t)) {
            return (string) $node->t;
        }

        $text = '';
        foreach ($node->r as $run) { // texte enrichi : concaténation des segments
            $text .= (string) $run->t;
        }

        return $text;
    }

    private static function loadXml(ZipArchive $zip, string $name): \SimpleXMLElement
    {
        $stat = $zip->statName($name);
        if ($stat === false) {
            throw new RuntimeException('Le classeur Excel est incomplet ou corrompu.');
        }
        if ($stat['size'] > self::MAX_XML_BYTES) {
            throw new RuntimeException('Le classeur Excel est trop volumineux.');
        }

        $xml = simplexml_load_string((string) $zip->getFromName($name), \SimpleXMLElement::class, LIBXML_NONET);
        if ($xml === false) {
            throw new RuntimeException('Le classeur Excel est illisible.');
        }

        return $xml;
    }

    private static function columnIndex(string $letters): int
    {
        $index = 0;
        foreach (str_split(strtoupper($letters)) as $char) {
            $index = $index * 26 + (ord($char) - 64);
        }

        return $index - 1;
    }

    private static function esc(string $value): string
    {
        // Caractères de contrôle interdits en XML 1.0 retirés.
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $value);

        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
