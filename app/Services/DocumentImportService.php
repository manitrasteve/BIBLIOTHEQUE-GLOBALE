<?php

namespace App\Services;

use App\Http\Controllers\Api\DocumentController;
use App\Models\Author;
use App\Models\Category;
use App\Models\Document;
use App\Models\Library;
use App\Support\SimpleXlsx;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Importation de documents par Excel : génération du modèle et vérification d'un lot.
 *
 * Rien n'est créé ici. La vérification transforme chaque ligne Excel en valeurs initiales
 * du formulaire « Ajouter un document » ; chaque document est ensuite créé un par un, par
 * l'utilisateur, via l'endpoint de création habituel (DocumentController::store).
 * Les règles de validation sont celles de la création manuelle (DocumentController::creationRules).
 */
class DocumentImportService
{
    /** Nombre maximal de lignes par fichier. */
    public const MAX_ROWS = 1000;

    /** Limites de taille des fichiers : celles de DocumentController::creationRules (en Ko). */
    public const PDF_MAX_KB = 51200;
    public const COVER_MAX_KB = 5120;

    /** Extensions d'image acceptées (règle Laravel « image », sans SVG). */
    public const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

    /*
     * Valeurs proposées par le formulaire (DocumentFormPage.jsx) : à garder synchronisées.
     * Type et catégorie restent libres (option « Autre ») ; le niveau est une liste fermée.
     */
    public const TYPES = ['Mémoire', 'Livre', 'Thèse', 'Rapport', 'Document', 'Autre'];
    public const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2', 'Doctorat'];
    public const CATEGORIES = ['Agronomie', 'Droit', 'Finance', 'Informatique', 'Lettres et sciences humaines', 'Médecine'];
    public const LANGUAGES = ['fr' => 'Français', 'mg' => 'Malgache', 'en' => 'Anglais', 'es' => 'Espagnol', 'pt' => 'Portugais', 'it' => 'Italien', 'ru' => 'Russe'];
    public const ACCESS_LEVELS = ['public' => 'Public', 'authentifie' => 'Authentifié', 'restreint' => 'Restreint'];

    /**
     * Colonnes du modèle Excel, dans l'ordre du formulaire.
     * « field » = clé de DocumentController::creationRules() (ou colonne spéciale d'import).
     */
    public static function columns(): array
    {
        return [
            ['key' => 'title', 'label' => 'Titre', 'required' => true, 'width' => 34, 'example' => 'Introduction à Laravel'],
            ['key' => 'subtitle', 'label' => 'Sous-titre', 'required' => false, 'width' => 26, 'example' => 'Guide pratique'],
            ['key' => 'authors', 'label' => 'Auteur(s)', 'required' => false, 'width' => 28, 'example' => 'Jean Rakoto; Marie Rasoanaivo'],
            ['key' => 'abstract', 'label' => 'Résumé', 'required' => false, 'width' => 40, 'example' => 'Présentation des bases du framework Laravel.'],
            ['key' => 'type', 'label' => 'Type', 'required' => true, 'width' => 14, 'example' => 'Livre'],
            ['key' => 'niveau', 'label' => 'Niveau', 'required' => false, 'width' => 11, 'example' => 'L3'],
            ['key' => 'category', 'label' => 'Catégorie', 'required' => true, 'width' => 24, 'example' => 'Informatique'],
            ['key' => 'library', 'label' => 'Bibliothèque', 'required' => true, 'width' => 26, 'example' => null], // exemple : première bibliothèque existante
            ['key' => 'year', 'label' => 'Année', 'required' => false, 'width' => 9, 'example' => '2024'],
            ['key' => 'publisher', 'label' => 'Éditeur', 'required' => false, 'width' => 20, 'example' => 'Presses universitaires'],
            ['key' => 'isbn', 'label' => 'ISBN', 'required' => false, 'width' => 18, 'example' => '9782100000000', 'text' => true],
            ['key' => 'language', 'label' => 'Langue', 'required' => true, 'width' => 13, 'example' => 'Français'],
            ['key' => 'access_level', 'label' => "Niveau d'accès", 'required' => false, 'width' => 15, 'example' => 'Authentifié'],
            ['key' => 'pdf', 'label' => 'Nom du fichier PDF', 'required' => true, 'width' => 26, 'example' => 'introduction-laravel.pdf'],
            ['key' => 'cover', 'label' => 'Nom de la couverture', 'required' => false, 'width' => 26, 'example' => 'introduction-laravel.jpg'],
        ];
    }

    /** Contenu binaire du modèle .xlsx (feuille « Documents » + feuille « Valeurs » d'aide). */
    public function template(): string
    {
        $columns = self::columns();
        $libraries = Library::query()->orderBy('name')->pluck('name')->all();
        $categories = collect(self::CATEGORIES)
            ->merge(Category::query()->orderBy('name')->pluck('name'))
            ->unique(fn ($name) => mb_strtolower($name))
            ->values()->all();

        $header = array_map(fn ($c) => $c['label'].($c['required'] ? ' *' : ''), $columns);
        $example = array_map(
            fn ($c) => $c['key'] === 'library' ? ($libraries[0] ?? 'Bibliothèque Centrale') : $c['example'],
            $columns,
        );

        // Feuille « Valeurs » : une colonne par liste, référencée par les listes déroulantes.
        $lists = [
            'Type (ou autre valeur libre)' => self::TYPES,
            'Niveau' => self::NIVEAUX,
            'Catégorie (ou nouvelle catégorie)' => $categories,
            'Bibliothèque' => $libraries,
            'Langue (ou autre langue)' => array_values(self::LANGUAGES),
            "Niveau d'accès" => array_values(self::ACCESS_LEVELS),
        ];
        $valueRows = [array_keys($lists)];
        $height = max(array_map('count', $lists));
        for ($i = 0; $i < $height; $i++) {
            $valueRows[] = array_map(fn ($values) => $values[$i] ?? '', array_values($lists));
        }

        $listRange = function (string $listName) use ($lists) {
            $index = array_search($listName, array_keys($lists), true);
            $letter = SimpleXlsx::columnLetter($index);

            return "Valeurs!\${$letter}\$2:\${$letter}\$".(count($lists[$listName]) + 1);
        };
        $columnIndex = fn (string $key) => array_search($key, array_column($columns, 'key'), true);

        $help = [
            ['Aide au remplissage'],
            ['Une ligne = un document. Les colonnes marquées * sont obligatoires.'],
            ['« Nom du fichier PDF » et « Nom de la couverture » doivent correspondre exactement aux noms des fichiers sélectionnés (ex. memoire-rakoto.pdf).'],
            ['Auteur(s) : séparer plusieurs auteurs par un point-virgule (;). Un auteur inconnu sera proposé à la création.'],
            ['Bibliothèque : doit correspondre à une bibliothèque existante (voir la feuille « Valeurs »).'],
            ["Niveau d'accès : Public, Authentifié ou Restreint (Authentifié si vide)."],
            ['Les documents sont créés en brouillon, un par un, après votre vérification dans le formulaire habituel.'],
        ];

        return SimpleXlsx::build([
            [
                'name' => 'Documents',
                'header' => true,
                'rows' => [$header, $example],
                'widths' => array_column($columns, 'width'),
                'textColumns' => [$columnIndex('isbn')],
                'validations' => array_values(array_filter([
                    ['column' => $columnIndex('type'), 'source' => $listRange('Type (ou autre valeur libre)'), 'strict' => false],
                    ['column' => $columnIndex('niveau'), 'source' => $listRange('Niveau'), 'strict' => true],
                    ['column' => $columnIndex('category'), 'source' => $listRange('Catégorie (ou nouvelle catégorie)'), 'strict' => false],
                    $libraries ? ['column' => $columnIndex('library'), 'source' => $listRange('Bibliothèque'), 'strict' => true] : null,
                    ['column' => $columnIndex('language'), 'source' => $listRange('Langue (ou autre langue)'), 'strict' => false],
                    ['column' => $columnIndex('access_level'), 'source' => $listRange("Niveau d'accès"), 'strict' => true],
                ])),
            ],
            [
                'name' => 'Valeurs',
                'header' => true,
                'rows' => $valueRows,
                'widths' => array_fill(0, count($lists), 30),
            ],
            [
                'name' => 'Aide',
                'rows' => $help,
                'widths' => [120],
            ],
        ]);
    }

    /**
     * Vérifie un lot : lit l'Excel, associe les fichiers par nom, valide chaque ligne avec
     * les règles de création et détecte les doublons (base de données et fichier Excel).
     *
     * @param  array<int, array{name: string, size: int, valid?: bool}>  $pdfs    fichiers PDF sélectionnés
     * @param  array<int, array{name: string, size: int, valid?: bool}>  $covers  images sélectionnées
     */
    public function analyze(string $excelPath, array $pdfs, array $covers): array
    {
        $sheet = SimpleXlsx::readFirstSheet($excelPath);
        if (! $sheet) {
            throw new RuntimeException('La première feuille du fichier Excel est vide.');
        }

        // En-tête : première ligne non vide ; chaque colonne est reconnue par son libellé.
        $headerLine = array_key_first($sheet);
        $mapping = $this->mapHeader($sheet[$headerLine]);
        $missing = array_values(array_map(
            fn ($c) => $c['label'],
            array_filter(self::columns(), fn ($c) => $c['required'] && ! isset($mapping[$c['key']])),
        ));
        if ($missing) {
            throw new RuntimeException('Colonnes obligatoires absentes du fichier Excel : '.implode(', ', $missing).'. Utilisez le modèle Excel.');
        }

        $dataRows = array_filter($sheet, fn ($line) => $line > $headerLine, ARRAY_FILTER_USE_KEY);
        if (! $dataRows) {
            throw new RuntimeException('Le fichier Excel ne contient aucune ligne de document.');
        }
        if (count($dataRows) > self::MAX_ROWS) {
            throw new RuntimeException('Le fichier Excel contient plus de '.self::MAX_ROWS.' lignes. Découpez-le en plusieurs lots.');
        }

        $libraries = Library::query()->get(['id', 'name']);
        $authors = Author::query()->get(['id', 'name']);
        $categories = Category::query()->pluck('name');
        $pdfIndex = $this->fileIndex($pdfs);
        $coverIndex = $this->fileIndex($covers);

        $rows = [];
        foreach ($dataRows as $line => $cells) {
            $values = [];
            foreach ($mapping as $key => $column) {
                $values[$key] = $cells[$column] ?? '';
            }
            $rows[] = $this->analyzeRow((int) $line, $values, $libraries, $authors, $categories, $pdfIndex, $coverIndex);
        }

        $this->markDuplicates($rows);

        $count = fn (string $status) => count(array_filter($rows, fn ($r) => $r['status'] === $status));
        $withCover = count(array_filter($rows, fn ($r) => $r['cover'] && ! $r['cover_error']));

        return [
            'rows' => $rows,
            'summary' => [
                'total' => count($rows),
                'valid' => $count('valid'),
                'duplicates' => $count('duplicate'),
                'errors' => $count('error'),
                'pdf_found' => count(array_filter($rows, fn ($r) => $r['pdf'] && ! $r['pdf_error'])),
                'covers_found' => $withCover,
                'without_cover' => count(array_filter($rows, fn ($r) => ! $r['cover'])),
            ],
            'ignored_columns' => array_values(array_diff_key($sheet[$headerLine], array_flip($mapping))),
        ];
    }

    private function analyzeRow(int $line, array $v, $libraries, $authors, $categories, array $pdfIndex, array $coverIndex): array
    {
        $errors = [];
        $notes = [];

        // Bibliothèque : doit exister (jamais créée automatiquement).
        $libraryName = $v['library'] ?? '';
        $library = $libraryName === '' ? null : $libraries->first(fn ($l) => $this->same($l->name, $libraryName));
        if ($libraryName !== '' && ! $library) {
            $errors[] = "Bibliothèque inconnue : « {$libraryName} ».";
        }

        // Auteurs : noms séparés par « ; ». Les auteurs existants sont cochés ; les autres
        // seront créés par l'utilisateur au moment de la création du document.
        $authorIds = [];
        $newAuthors = [];
        foreach (preg_split('/\s*;\s*/u', $v['authors'] ?? '', -1, PREG_SPLIT_NO_EMPTY) as $name) {
            $existing = $authors->first(fn ($a) => $this->same($a->name, $name));
            if ($existing) {
                $authorIds[] = $existing->id;
            } elseif (mb_strlen($name) > 255) {
                $errors[] = "Nom d'auteur trop long : « ".Str::limit($name, 40).' ».';
            } else {
                $newAuthors[] = $name;
            }
        }
        $authorIds = array_values(array_unique($authorIds));
        $newAuthors = array_values(array_unique($newAuthors));

        // Niveau : liste fermée du formulaire.
        $niveau = $v['niveau'] ?? '';
        if ($niveau !== '') {
            $match = collect(self::NIVEAUX)->first(fn ($n) => $this->same($n, $niveau));
            if ($match) {
                $niveau = $match;
            } else {
                $errors[] = "Niveau invalide : « {$niveau} » (valeurs possibles : ".implode(', ', self::NIVEAUX).').';
            }
        }

        // Type / catégorie : valeur proposée par le formulaire, ou valeur libre (« Autre »).
        $type = $v['type'] ?? '';
        $type = collect(self::TYPES)->first(fn ($t) => $this->same($t, $type)) ?? $type;
        $category = $v['category'] ?? '';
        $knownCategory = collect(self::CATEGORIES)->merge($categories)->first(fn ($c) => $this->same($c, $category));
        if ($category !== '' && ! $knownCategory) {
            $notes[] = "Nouvelle catégorie : « {$category} ».";
        }
        $category = $knownCategory ?? $category;

        $language = $v['language'] ?? '';
        $language = collect(self::LANGUAGES)->first(
            fn ($label, $code) => $this->same($label, $language) || $this->same($code, $language)
        ) ?? $language;

        // Niveau d'accès : libellé (« Authentifié ») ou code (« authentifie ») ; Authentifié par défaut, comme le formulaire.
        $access = $v['access_level'] ?? '';
        $accessCode = $access === '' ? 'authentifie' : collect(self::ACCESS_LEVELS)->search(
            fn ($label, $code) => $this->same($label, $access) || $this->same($code, $access)
        );
        if ($accessCode === false) {
            $errors[] = "Niveau d'accès invalide : « {$access} » (Public, Authentifié ou Restreint).";
            $accessCode = 'authentifie';
        }

        // Valeurs initiales du formulaire, validées avec les règles de la création manuelle.
        $form = [
            'title' => $v['title'] ?? '',
            'subtitle' => $v['subtitle'] ?? '',
            'abstract' => $this->plainTextToHtml($v['abstract'] ?? ''),
            'type' => $type,
            'niveau' => $niveau,
            'category' => $category,
            'library_id' => $library?->id,
            'year' => $v['year'] ?? '',
            'publisher' => $v['publisher'] ?? '',
            'isbn' => $v['isbn'] ?? '',
            'language' => $language,
            'access_level' => $accessCode,
            'author_ids' => $authorIds,
        ];
        $rules = collect(DocumentController::creationRules())->except(['file', 'cover'])->all();
        $payload = array_filter($form, fn ($value) => $value !== '' && $value !== null); // comme le formulaire : champs vides non envoyés
        $validator = Validator::make($payload, $rules, $this->messages(), $this->attributes());
        foreach ($validator->errors()->messages() as $field => $messages) {
            if ($field === 'library_id' && $libraryName !== '') {
                continue; // déjà signalé (« Bibliothèque inconnue »)
            }
            array_push($errors, ...$messages);
        }

        // Fichiers : associés par nom exact, jamais par ordre de sélection.
        [$pdf, $pdfError] = $this->matchFile($v['pdf'] ?? '', $pdfIndex, ['pdf'], self::PDF_MAX_KB, 'PDF');
        if (($v['pdf'] ?? '') === '') {
            $pdfError = 'Nom du fichier PDF manquant : le PDF est obligatoire.';
        }
        [$cover, $coverError] = $this->matchFile($v['cover'] ?? '', $coverIndex, self::COVER_EXTENSIONS, self::COVER_MAX_KB, 'Couverture');
        foreach ([$pdfError, $coverError] as $fileError) {
            if ($fileError) {
                $errors[] = $fileError;
            }
        }

        return [
            'line' => $line,
            'status' => $errors ? 'error' : 'valid',
            'errors' => array_values(array_unique($errors)),
            'notes' => $notes,
            'duplicate' => null,
            'form' => $form,
            'library_name' => $library?->name ?? $libraryName,
            'new_authors' => $newAuthors,
            'author_names' => array_merge(
                $authors->whereIn('id', $authorIds)->pluck('name')->all(),
                $newAuthors,
            ),
            'pdf' => ($v['pdf'] ?? '') !== '' ? $v['pdf'] : null,
            'pdf_error' => $pdfError !== null,
            'cover' => ($v['cover'] ?? '') !== '' ? $v['cover'] : null,
            'cover_error' => $coverError !== null,
            'matched_pdf' => $pdf,
            'matched_cover' => $cover,
        ];
    }

    /**
     * Doublons : ISBN s'il est renseigné, sinon titre + auteur.
     * A. avec les documents existants ; B. entre les lignes du fichier (la première occurrence est conservée).
     */
    private function markDuplicates(array &$rows): void
    {
        $isbns = array_filter(array_map(fn ($r) => $this->normalizeIsbn($r['form']['isbn']), $rows));
        $titles = array_map(fn ($r) => mb_strtolower(trim($r['form']['title'])), array_filter($rows, fn ($r) => ! $this->normalizeIsbn($r['form']['isbn'])));

        $byIsbn = [];
        if ($isbns) {
            Document::query()->whereNotNull('isbn')->where('isbn', '!=', '')
                ->get(['id', 'title', 'isbn', 'status'])
                ->each(function ($doc) use (&$byIsbn, $isbns) {
                    $key = $this->normalizeIsbn($doc->isbn);
                    if (in_array($key, $isbns, true)) {
                        $byIsbn[$key] ??= $doc;
                    }
                });
        }
        $byTitle = $titles
            ? Document::query()->with('authors:id,name')
                ->whereIn(DB::raw('LOWER(title)'), array_values(array_unique($titles)))
                ->get(['id', 'title', 'status'])
                ->groupBy(fn ($doc) => mb_strtolower(trim($doc->title)))
            : collect();

        $seenIsbn = [];    // ISBN → ligne Excel de la première occurrence
        $seenTitles = [];  // [titre, auteurs, ligne] des lignes sans ISBN déjà vues
        foreach ($rows as &$row) {
            $isbn = $this->normalizeIsbn($row['form']['isbn']);
            $title = mb_strtolower(trim($row['form']['title']));
            $authorNames = array_map(fn ($n) => mb_strtolower(trim($n)), $row['author_names']);
            $duplicate = null;

            if ($isbn) {
                if (isset($byIsbn[$isbn])) {
                    $duplicate = $this->duplicateInfo('base', 'isbn', $byIsbn[$isbn]);
                } elseif (isset($seenIsbn[$isbn])) {
                    $duplicate = ['source' => 'fichier', 'match' => 'isbn', 'line' => $seenIsbn[$isbn]];
                }
                $seenIsbn[$isbn] ??= $row['line'];
            } elseif ($title !== '') {
                foreach ($byTitle->get($title, []) as $doc) {
                    $docAuthors = $doc->authors->map(fn ($a) => mb_strtolower(trim($a->name)))->all();
                    if ($this->sameAuthors($authorNames, $docAuthors)) {
                        $duplicate = $this->duplicateInfo('base', 'titre_auteur', $doc);
                        break;
                    }
                }
                foreach ($duplicate ? [] : $seenTitles as [$seenTitle, $seenAuthors, $seenLine]) {
                    if ($seenTitle === $title && $this->sameAuthors($authorNames, $seenAuthors)) {
                        $duplicate = ['source' => 'fichier', 'match' => 'titre_auteur', 'line' => $seenLine];
                        break;
                    }
                }
                $seenTitles[] = [$title, $authorNames, $row['line']];
            }

            if ($duplicate) {
                $row['duplicate'] = $duplicate;
                if ($row['status'] === 'valid') {
                    $row['status'] = 'duplicate';
                }
            }
        }
        unset($row);
    }

    /** Titre + auteur : même titre et au moins un auteur commun (ou aucun auteur des deux côtés). */
    private function sameAuthors(array $a, array $b): bool
    {
        return (! $a && ! $b) || (bool) array_intersect($a, $b);
    }

    private function duplicateInfo(string $source, string $match, Document $doc): array
    {
        return ['source' => $source, 'match' => $match, 'document_id' => $doc->id, 'document_title' => $doc->title, 'document_status' => $doc->status];
    }

    /** Index des fichiers sélectionnés par nom exact ; un nom présent deux fois est ambigu. */
    private function fileIndex(array $files): array
    {
        $index = [];
        foreach ($files as $file) {
            $name = trim((string) ($file['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $index[$name] = isset($index[$name]) ? ['ambiguous' => true] : [
                'name' => $name,
                'size' => (int) ($file['size'] ?? 0),
                'valid' => filter_var($file['valid'] ?? true, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $index;
    }

    /** @return array{0: ?string, 1: ?string} [nom associé, erreur] */
    private function matchFile(string $name, array $index, array $extensions, int $maxKb, string $label): array
    {
        if ($name === '') {
            return [null, null];
        }

        $file = $index[$name] ?? null;
        if (! $file) {
            $close = collect(array_keys($index))->first(fn ($n) => $this->same($n, $name));

            return [null, "{$label} introuvable : « {$name} » ne fait pas partie des fichiers sélectionnés"
                .($close ? " (fichier proche : « {$close} », le nom doit être identique)." : '.')];
        }
        if (! empty($file['ambiguous'])) {
            return [null, "{$label} ambigu : plusieurs fichiers sélectionnés s'appellent « {$name} »."];
        }
        if (! in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), $extensions, true)) {
            return [null, "{$label} : format non accepté pour « {$name} » (".implode(', ', $extensions).').'];
        }
        if (! $file['valid']) {
            return [null, "{$label} : « {$name} » n'est pas un fichier ".($label === 'PDF' ? 'PDF' : 'image').' valide.'];
        }
        if ($file['size'] > $maxKb * 1024) {
            return [null, "{$label} : « {$name} » dépasse la taille maximale de ".round($maxKb / 1024).' Mo.'];
        }

        return [$name, null];
    }

    /** En-tête Excel → [clé de colonne => index], par libellé (accents, casse, « * » et espaces ignorés). */
    private function mapHeader(array $headerCells): array
    {
        $byLabel = [];
        foreach (self::columns() as $column) {
            $byLabel[$this->normalizeLabel($column['label'])] = $column['key'];
        }
        // Variantes courantes acceptées.
        $byLabel += ['auteur' => 'authors', 'auteurs' => 'authors', 'fichierpdf' => 'pdf', 'pdf' => 'pdf', 'couverture' => 'cover', 'niveaudacces' => 'access_level'];

        $mapping = [];
        foreach ($headerCells as $index => $label) {
            $key = $byLabel[$this->normalizeLabel($label)] ?? null;
            if ($key && ! isset($mapping[$key])) {
                $mapping[$key] = $index;
            }
        }

        return $mapping;
    }

    private function normalizeLabel(string $label): string
    {
        return preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($label)));
    }

    private function normalizeIsbn(?string $isbn): string
    {
        return strtoupper(preg_replace('/[^0-9Xx]/', '', (string) $isbn));
    }

    private function same(?string $a, ?string $b): bool
    {
        $normalize = fn ($value) => mb_strtolower(trim(preg_replace('/\s+/u', ' ', (string) $value)));

        return $normalize($a) === $normalize($b);
    }

    /** Résumé Excel (texte brut) → HTML du champ Résumé (paragraphes échappés). */
    private function plainTextToHtml(string $text): string
    {
        $text = trim($text);
        if ($text === '') {
            return '';
        }

        return collect(preg_split('/\R{2,}/u', $text))
            ->map(fn ($p) => '<p>'.nl2br(e(trim($p)), false).'</p>')
            ->implode('');
    }

    private function messages(): array
    {
        return [
            'required' => 'Le champ « :attribute » est obligatoire.',
            'required_without' => 'Le champ « :attribute » est obligatoire.',
            'string' => 'Le champ « :attribute » doit être un texte.',
            'max' => 'Le champ « :attribute » ne doit pas dépasser :max caractères.',
            'digits' => 'Le champ « :attribute » doit contenir :digits chiffres.',
            'regex' => 'Le champ « :attribute » doit contenir au moins une lettre ou un chiffre.',
            'in' => 'La valeur du champ « :attribute » est invalide.',
            'exists' => 'La valeur du champ « :attribute » est introuvable.',
        ];
    }

    private function attributes(): array
    {
        return [
            'title' => 'Titre', 'subtitle' => 'Sous-titre', 'abstract' => 'Résumé', 'type' => 'Type',
            'niveau' => 'Niveau', 'category' => 'Catégorie', 'category_id' => 'Catégorie',
            'library_id' => 'Bibliothèque', 'year' => 'Année', 'publisher' => 'Éditeur', 'isbn' => 'ISBN',
            'language' => 'Langue', 'access_level' => "Niveau d'accès", 'author_ids.*' => 'Auteur(s)',
        ];
    }
}
