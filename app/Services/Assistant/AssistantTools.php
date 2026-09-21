<?php

namespace App\Services\Assistant;

use App\Models\ActivityLog;
use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Outils en LECTURE SEULE appelables par Gemini (appel de fonctions).
 *
 * Sécurité (le prompt n'est jamais la barrière) :
 *  - Gemini ne fournit que des CRITÈRES (titre, statut, date…). Aucun identifiant (user_id, library_id…) n'est
 *    accepté : les clés inconnues sont ignorées.
 *  - Le périmètre vient de AssistantScope (utilisateur authentifié). Un bibliothécaire est limité à sa
 *    bibliothèque par les requêtes elles-mêmes ; demander une autre bibliothèque ne renvoie aucune donnée.
 *  - Seules les actions de GESTION du journal d'audit sont exposées (pas les connexions, lectures, favoris,
 *    questions IA des membres). Permissions et vidage de corbeille sont réservés à l'administrateur.
 *  - Résultats bornés (LIMIT) ; le total réel est toujours indiqué.
 */
class AssistantTools
{
    private const LIMIT = 15;
    private const LOG_LIMIT = 20;
    private const STATUSES = ['brouillon', 'publie', 'archive'];

    private const DOCUMENT_ACTIONS = ['creation_document', 'modification_document', 'publication_document', 'archivage_document', 'suppression_document', 'restauration_document', 'suppression_definitive_document'];
    private const LIBRARY_ACTIONS = ['creation_bibliotheque', 'modification_bibliotheque', 'suppression_bibliotheque'];
    private const USER_ACTIONS = ['creation_compte', 'validation_compte', 'desactivation_compte', 'reactivation_compte', 'suppression_utilisateur', 'restauration_utilisateur', 'suppression_definitive_utilisateur', 'creation_bibliothecaire'];
    private const ADMIN_ONLY_ACTIONS = ['permissions_modifiees', 'vidage_corbeille'];

    private const ACTION_LABELS = [
        'creation_document' => 'Document ajouté', 'modification_document' => 'Document modifié', 'publication_document' => 'Document publié',
        'archivage_document' => 'Document archivé', 'suppression_document' => 'Document supprimé', 'restauration_document' => 'Document restauré',
        'suppression_definitive_document' => 'Document supprimé définitivement',
        'creation_bibliotheque' => 'Bibliothèque créée', 'modification_bibliotheque' => 'Bibliothèque modifiée', 'suppression_bibliotheque' => 'Bibliothèque supprimée',
        'creation_compte' => 'Compte créé', 'validation_compte' => 'Compte validé', 'desactivation_compte' => 'Compte désactivé',
        'reactivation_compte' => 'Compte réactivé', 'suppression_utilisateur' => 'Compte supprimé', 'restauration_utilisateur' => 'Compte restauré',
        'suppression_definitive_utilisateur' => 'Compte supprimé définitivement', 'creation_bibliothecaire' => 'Bibliothécaire créé',
        'permissions_modifiees' => 'Permissions modifiées', 'vidage_corbeille' => 'Corbeille vidée',
    ];

    // Anciens codes de type (avant la saisie libre) → libellés.
    private const TYPE_LABELS = ['livre' => 'Livre', 'memoire' => 'Mémoire', 'these' => 'Thèse', 'rapport' => 'Rapport', 'autre' => 'Autre'];

    private const ELEMENT_TYPES = ['document' => Document::class, 'bibliotheque' => Library::class, 'compte' => User::class];

    private const STAFF_LIMIT = 30;

    // Libellés des actions propres à l'historique PERSONNEL (les autres codes sont affichés sous une forme lisible).
    private const OWN_ACTION_LABELS = [
        'connexion' => 'Connexion', 'consultation_document' => "Consultation d'un document", 'question_ia' => "Question à l'assistant IA",
        'ajout_favori' => 'Ajout aux favoris', 'retrait_favori' => 'Retrait des favoris',
    ];

    public function __construct(private readonly AssistantScope $scope)
    {
    }

    // ------------------------------------------------------------------ déclarations Gemini

    /** Déclarations d'outils adaptées au rôle (un bibliothécaire ne voit pas le paramètre « bibliotheque »). */
    public function declarations(): array
    {
        $admin = $this->scope->isAdmin();
        $string = fn (string $description) => ['type' => 'STRING', 'description' => $description];
        $enum = fn (string $description, array $values) => ['type' => 'STRING', 'description' => $description, 'enum' => $values];
        $date = fn (string $description) => ['type' => 'STRING', 'description' => $description . ' Format AAAA-MM-JJ.'];
        $library = $admin ? ['bibliotheque' => $string('Nom (ou partie du nom) d\'une bibliothèque pour restreindre la recherche.')] : [];
        $dates = ['date' => $date('Jour précis.'), 'date_debut' => $date('Début de période (inclus).'), 'date_fin' => $date('Fin de période (incluse).')];
        $documentFilters = [
            'titre' => $string('Titre ou partie du titre du document.'),
            'type' => $string('Type du document (ex. livre, mémoire, thèse, rapport).'),
            'categorie' => $string('Catégorie / domaine (ex. Informatique, Droit).'),
        ] + $library;
        $actions = $this->allowedActions();

        return [
            [
                'name' => 'compter_documents',
                'description' => 'Compte les documents (hors corbeille) selon des critères et donne aussi le détail par statut (brouillon, publie, archive).',
                'parameters' => ['type' => 'OBJECT', 'properties' => $documentFilters + ['statut' => $enum('Statut à compter.', self::STATUSES)]],
            ],
            [
                'name' => 'repartition_documents',
                'description' => 'Répartition (nombre de documents) par statut, type ou catégorie' . ($admin ? ' ou bibliothèque' : '') . '.',
                'parameters' => ['type' => 'OBJECT', 'properties' => ['par' => $enum('Critère de regroupement.', $admin ? ['statut', 'type', 'categorie', 'bibliotheque'] : ['statut', 'type', 'categorie'])] + $documentFilters, 'required' => ['par']],
            ],
            [
                'name' => 'rechercher_documents',
                'description' => 'Recherche des documents (titre, type, catégorie, statut, auteur, date d\'ajout) et renvoie leur liste avec qui les a ajoutés et quand.',
                'parameters' => ['type' => 'OBJECT', 'properties' => $documentFilters + ['auteur' => $string('Nom d\'un auteur du document.'), 'statut' => $enum('Statut du document.', self::STATUSES)] + $dates],
            ],
            [
                'name' => 'historique_document',
                'description' => 'Historique des actions faites sur un document (ajout, modification avec avant/après, publication, archivage, suppression, restauration) : qui, quoi, quand, dans quelle bibliothèque.',
                'parameters' => ['type' => 'OBJECT', 'properties' => [
                    'titre' => $string('Titre ou partie du titre du document.'),
                    'action' => $enum('Filtrer sur une action.', self::DOCUMENT_ACTIONS),
                ] + $dates, 'required' => ['titre']],
            ],
            [
                'name' => 'rechercher_actions',
                'description' => 'Recherche dans le journal des actions de gestion (documents, bibliothèques, comptes utilisateurs) par action, auteur de l\'action, élément concerné et date.',
                'parameters' => ['type' => 'OBJECT', 'properties' => [
                    'action' => $enum('Type d\'action.', $actions),
                    'utilisateur' => $string('Nom de la personne qui a effectué l\'action.'),
                    'element' => $string('Nom ou titre de l\'élément concerné (document, bibliothèque, compte).'),
                    'type_element' => $enum('Nature de l\'élément concerné.', array_keys(self::ELEMENT_TYPES)),
                ] + $library + $dates],
            ],
            [
                'name' => 'rechercher_bibliotheques',
                'description' => 'Liste les bibliothèques' . ($admin ? '' : ' (uniquement la vôtre)') . ' avec leur adresse, leur nombre de documents et leur date de création.',
                // « properties » doit être un OBJET JSON, même vide (un tableau PHP vide serait envoyé « [] » et refusé).
                'parameters' => ['type' => 'OBJECT', 'properties' => $admin ? ['nom' => $string('Nom ou partie du nom.')] : new \stdClass()],
            ],
            [
                'name' => 'lister_bibliothecaires',
                'description' => 'Donne le nombre de bibliothécaires (membres du Service Numérique)' . ($admin ? '' : ' de votre bibliothèque') . ', avec le nom de chacun et la date de création de son compte. À utiliser pour « combien de bibliothécaires », « qui sont les bibliothécaires ».',
                // « properties » doit être un OBJET JSON, même vide.
                'parameters' => ['type' => 'OBJECT', 'properties' => $admin ? $library : new \stdClass()],
            ],
            [
                'name' => 'mon_historique',
                'description' => 'Historique des actions du compte connecté LUI-MÊME (« mon historique », « mes actions », « qu\'ai-je fait ») : tout l\'historique, celui d\'aujourd\'hui ou celui d\'un jour précis. Ne renvoie jamais les actions d\'une autre personne.',
                'parameters' => ['type' => 'OBJECT', 'properties' => [
                    'periode' => $enum('« tout » = tout l\'historique (par défaut) ; « aujourdhui » = les actions du jour.', ['tout', 'aujourdhui']),
                ] + $dates],
            ],
            [
                'name' => 'aucune_donnee_necessaire',
                'description' => 'À utiliser UNIQUEMENT pour une salutation, un remerciement ou une question sur ce que l\'assistant sait faire. Interdit dès que la question porte sur des documents, bibliothèques, actions ou utilisateurs.',
                'parameters' => ['type' => 'OBJECT', 'properties' => ['motif' => $string('Pourquoi aucune donnée n\'est nécessaire.')]],
            ],
        ];
    }

    // ------------------------------------------------------------------ exécution

    public function run(string $name, array $args): array
    {
        try {
            $result = match ($name) {
                'compter_documents' => $this->compterDocuments($args),
                'repartition_documents' => $this->repartitionDocuments($args),
                'rechercher_documents' => $this->rechercherDocuments($args),
                'historique_document' => $this->historiqueDocument($args),
                'rechercher_actions' => $this->rechercherActions($args),
                'rechercher_bibliotheques' => $this->rechercherBibliotheques($args),
                'lister_bibliothecaires' => $this->listerBibliothecaires($args),
                'mon_historique' => $this->monHistorique($args),
                'aucune_donnee_necessaire' => $this->aucuneDonnee(),
                default => ['erreur' => "Outil inconnu : {$name}."],
            };
        } catch (InvalidToolArguments $e) {
            $result = ['erreur' => $e->getMessage()];
        }

        // Trace de sécurité : qui a interrogé quoi (les arguments sont des critères, pas des données personnelles).
        Log::info('assistant.tool', ['user_id' => $this->scope->userId, 'role' => $this->scope->role, 'outil' => $name, 'criteres' => $args, 'resultat_total' => $result['total'] ?? null]);

        return $result;
    }

    // ------------------------------------------------------------------ outils

    private function compterDocuments(array $args): array
    {
        [$ids, $error] = $this->libraryIds($this->text($args, 'bibliotheque'));
        if ($error) {
            return $error;
        }

        $base = $this->documents($ids);
        $filters = $this->applyDocumentFilters($base, $args, false);
        $status = $this->choice($args, 'statut', self::STATUSES);
        $byStatus = (clone $base)->selectRaw('documents.status as label, COUNT(*) as total')->groupBy('documents.status')->pluck('total', 'label');

        return [
            'total' => (int) ($status ? ($byStatus[$status] ?? 0) : $byStatus->sum()),
            'filtres' => $filters + ($status ? ['statut' => $status] : []),
            'par_statut' => array_map(fn ($s) => (int) ($byStatus[$s] ?? 0), array_combine(self::STATUSES, self::STATUSES)),
            'perimetre' => $this->perimeter($ids),
        ];
    }

    private function repartitionDocuments(array $args): array
    {
        $by = $this->choice($args, 'par', ['statut', 'type', 'categorie', 'bibliotheque']);
        if (!$by) {
            throw new InvalidToolArguments('Le paramètre « par » est obligatoire (statut, type, categorie).');
        }
        if ($by === 'bibliotheque' && !$this->scope->isAdmin()) {
            return ['trouve' => false, 'hors_perimetre' => true, 'message' => "Votre périmètre est limité à la bibliothèque « {$this->scope->libraryName} »."];
        }

        [$ids, $error] = $this->libraryIds($this->text($args, 'bibliotheque'));
        if ($error) {
            return $error;
        }

        $base = $this->documents($ids);
        $filters = $this->applyDocumentFilters($base, $args, true);

        $rows = match ($by) {
            'statut' => (clone $base)->selectRaw('documents.status as label, COUNT(*) as total')->groupBy('documents.status')->get(),
            'type' => (clone $base)->selectRaw('documents.type as label, COUNT(*) as total')->groupBy('documents.type')->get(),
            'categorie' => (clone $base)->join('categories', 'categories.id', '=', 'documents.category_id')->selectRaw('categories.name as label, COUNT(*) as total')->groupBy('categories.name')->get(),
            'bibliotheque' => (clone $base)->join('libraries', 'libraries.id', '=', 'documents.library_id')->selectRaw('libraries.name as label, COUNT(*) as total')->groupBy('libraries.name')->get(),
        };

        // Le type est libre (« livre », « Livre », « Mémoire »…) : on fusionne les variantes.
        $merged = [];
        foreach ($rows as $row) {
            $key = $by === 'type' ? Str::ascii(mb_strtolower(trim((string) $row->label))) : (string) $row->label;
            $label = $by === 'type'
                ? (self::TYPE_LABELS[$key] ?? ($key === '' ? 'Non renseigné' : mb_strtoupper(mb_substr(trim((string) $row->label), 0, 1)) . mb_substr(trim((string) $row->label), 1)))
                : (string) $row->label;
            $merged[$key]['libelle'] = $merged[$key]['libelle'] ?? $label;
            $merged[$key]['nombre'] = ($merged[$key]['nombre'] ?? 0) + (int) $row->total;
        }
        $repartition = collect($merged)->sortByDesc('nombre')->values()->all();

        return [
            'total' => (int) array_sum(array_column($repartition, 'nombre')),
            'par' => $by,
            'repartition' => $repartition,
            'filtres' => $filters,
            'perimetre' => $this->perimeter($ids),
        ] + ($repartition ? [] : ['trouve' => false, 'message' => 'Aucun document ne correspond dans les données disponibles.']);
    }

    private function rechercherDocuments(array $args): array
    {
        [$ids, $error] = $this->libraryIds($this->text($args, 'bibliotheque'));
        if ($error) {
            return $error;
        }

        $query = $this->documents($ids);
        $filters = $this->applyDocumentFilters($query, $args, true);

        if ($author = $this->text($args, 'auteur')) {
            $query->whereHas('authors', fn ($q) => $q->where('name', 'like', "%{$author}%"));
            $filters['auteur'] = $author;
        }
        if ($range = $this->dateRange($args)) {
            $query->whereBetween('documents.created_at', $range);
            $filters['ajoute_entre'] = [$this->local($range[0]), $this->local($range[1])];
        }

        $total = (clone $query)->count();
        $documents = $query->with(['category:id,name', 'library:id,name', 'authors:id,name', 'creator:id,name'])
            ->orderByDesc('documents.created_at')->limit(self::LIMIT)->get();

        if ($documents->isEmpty()) {
            return ['trouve' => false, 'total' => 0, 'filtres' => $filters, 'message' => 'Aucun document trouvé dans les données disponibles.', 'perimetre' => $this->perimeter($ids)];
        }

        return [
            'trouve' => true,
            'total' => $total,
            'affiches' => $documents->count(),
            'documents' => $documents->map(fn (Document $d) => [
                'titre' => $d->title,
                'type' => $d->type,
                'niveau' => $d->niveau,
                'categorie' => $d->category?->name,
                'bibliotheque' => $d->library?->name,
                'statut' => $d->status,
                'annee' => $d->year,
                'auteurs' => $d->authors->pluck('name')->all(),
                'ajoute_par' => $d->creator?->name,
                'ajoute_le' => $this->local($d->created_at),
                'publie_le' => $d->published_at ? $this->local($d->published_at) : null,
            ])->all(),
            'filtres' => $filters,
            'perimetre' => $this->perimeter($ids),
        ];
    }

    private function historiqueDocument(array $args): array
    {
        if (!$this->text($args, 'titre')) {
            throw new InvalidToolArguments('Le titre du document est obligatoire.');
        }

        return $this->searchLogs($args + ['type_element' => 'document'], self::DOCUMENT_ACTIONS, $this->text($args, 'titre'));
    }

    private function rechercherActions(array $args): array
    {
        return $this->searchLogs($args, $this->allowedActions(), $this->text($args, 'element'));
    }

    private function rechercherBibliotheques(array $args): array
    {
        $name = $this->text($args, 'nom');

        if ($this->scope->isAdmin()) {
            $query = Library::query()->when($name, fn ($q) => $q->where('name', 'like', "%{$name}%"));
        } else {
            if ($name !== null && !$this->sameLibrary($name)) {
                return $this->outOfScope();
            }
            $query = Library::query()->whereKey($this->scope->libraryId);
        }

        $total = (clone $query)->count();
        $libraries = $query->orderByDesc('created_at')->limit(self::LIMIT)->get();

        if ($libraries->isEmpty()) {
            return ['trouve' => false, 'total' => 0, 'message' => 'Aucune bibliothèque trouvée dans les données disponibles.'];
        }

        $counts = Document::query()->whereIn('library_id', $libraries->pluck('id'))->selectRaw('library_id, COUNT(*) as total')->groupBy('library_id')->pluck('total', 'library_id');

        return [
            'trouve' => true,
            'total' => $total,
            'bibliotheques' => $libraries->map(fn (Library $l) => [
                'nom' => $l->name, 'adresse' => $l->address, 'localisation' => $l->location,
                'jours_ouverture' => $l->opening_days, 'horaires' => $l->opening_hours,
                'nombre_documents' => (int) ($counts[$l->id] ?? 0),
                'creee_le' => $this->local($l->created_at),
            ])->all(),
        ];
    }

    /**
     * Bibliothécaires du périmètre : total, noms et date de création du compte (ni e-mail, ni téléphone, ni identifiant).
     * Un bibliothécaire ne voit que ceux de SA bibliothèque : le filtre vient de libraryIds(), pas du prompt.
     */
    private function listerBibliothecaires(array $args): array
    {
        [$ids, $error] = $this->libraryIds($this->text($args, 'bibliotheque'));
        if ($error) {
            return $error;
        }

        $query = User::query()->where('role', 'bibliothecaire')->when($ids !== null, fn ($q) => $q->whereIn('library_id', $ids)); // comptes supprimés (corbeille) exclus
        $total = (clone $query)->count();

        if ($total === 0) {
            return ['trouve' => false, 'total' => 0, 'message' => 'Aucun bibliothécaire trouvé dans les données disponibles.', 'perimetre' => $this->perimeter($ids)];
        }

        $active = (clone $query)->where('is_active', true)->count();
        $people = $query->with('library:id,name')->orderBy('created_at')->orderBy('id')->limit(self::STAFF_LIMIT)->get();

        return [
            'trouve' => true,
            'total' => $total,
            'comptes_actifs' => $active,
            'comptes_inactifs' => $total - $active,
            'affiches' => $people->count(),
            'bibliothecaires' => $people->map(fn (User $u) => [
                'nom' => $u->name,
                'compte_cree_le' => $this->local($u->created_at, 'Y-m-d'),
                'compte' => $u->is_active ? 'actif' : 'inactif (désactivé ou en attente d\'activation)',
                'bibliotheque' => $u->library?->name,
            ])->all(),
            'perimetre' => $this->perimeter($ids),
        ];
    }

    /** Historique du compte connecté uniquement : le filtre user_id vient de l'utilisateur authentifié, jamais des arguments. */
    private function monHistorique(array $args): array
    {
        if ($this->choice($args, 'periode', ['tout', 'aujourdhui']) === 'aujourdhui') {
            $args['date'] = CarbonImmutable::now($this->timezone())->format('Y-m-d');
        }

        $query = ActivityLog::query()->where('user_id', $this->scope->userId);
        $filters = [];

        if ($range = $this->dateRange($args)) {
            $query->whereBetween('created_at', $range);
            $filters['entre'] = [$this->local($range[0]), $this->local($range[1])];
        } else {
            $filters['periode'] = 'tout';
        }

        $total = (clone $query)->count();

        if ($total === 0) {
            return ['trouve' => false, 'total' => 0, 'filtres' => $filters, 'message' => "Aucune action trouvée dans votre historique pour cette période."];
        }

        $label = fn (string $action) => self::OWN_ACTION_LABELS[$action] ?? self::ACTION_LABELS[$action] ?? Str::ucfirst(str_replace('_', ' ', $action));
        $byAction = (clone $query)->selectRaw('action, COUNT(*) as total')->groupBy('action')->orderByDesc('total')->pluck('total', 'action');
        $logs = $query->orderByDesc('created_at')->orderByDesc('id')->limit(self::LOG_LIMIT)->get();

        return [
            'trouve' => true,
            'total' => $total,
            'affiches' => $logs->count(),
            'par_type_action' => $byAction->mapWithKeys(fn ($n, $a) => [$label($a) => (int) $n])->all(),
            'actions' => $logs->map(fn (ActivityLog $l) => [
                'action' => $label($l->action),
                'element' => $l->subject_label ?? ($l->description ? mb_substr($l->description, 0, 120) : null),
                'date' => $this->local($l->created_at, 'Y-m-d'),
                'heure' => $this->local($l->created_at, 'H:i'),
                'modifications' => $this->compactChanges($l->changes),
            ])->all(),
            'filtres' => $filters,
            'perimetre' => 'Votre propre historique',
        ];
    }

    private function aucuneDonnee(): array
    {
        return [
            'info' => "Aucune donnée n'a été consultée. Réponds seulement à une salutation ou présente ce que tu sais faire ; toute question sur les données doit passer par un outil.",
            'capacites' => ['compter et répartir les documents', 'rechercher des documents', "consulter l'historique d'un document", 'rechercher les actions de gestion (documents, bibliothèques, comptes)', 'lister les bibliothèques', 'lister les bibliothécaires (nombre, noms, date de création des comptes)', 'consulter votre propre historique (tout, aujourd\'hui ou une date)'],
        ];
    }

    // ------------------------------------------------------------------ journal d'audit

    private function searchLogs(array $args, array $allowedActions, ?string $element): array
    {
        [$ids, $error] = $this->libraryIds($this->text($args, 'bibliotheque'));
        if ($error) {
            return $error;
        }

        $query = ActivityLog::query()->whereIn('action', $allowedActions);
        $filters = [];

        // Périmètre : bibliothécaire = sa bibliothèque uniquement (les entrées sans bibliothèque sont exclues).
        if ($ids !== null) {
            $query->whereIn('library_id', $ids);
        }

        if ($action = $this->choice($args, 'action', $allowedActions)) {
            $query->where('action', $action);
            $filters['action'] = $action;
        }
        if ($type = $this->choice($args, 'type_element', array_keys(self::ELEMENT_TYPES))) {
            $query->where('subject_type', self::ELEMENT_TYPES[$type]);
            $filters['type_element'] = $type;
        }
        if ($element) {
            $query->where('subject_label', 'like', "%{$element}%");
            $filters['element'] = $element;
        }
        if ($person = $this->text($args, 'utilisateur')) {
            $query->whereHas('user', fn ($q) => $q->where('name', 'like', "%{$person}%"));
            $filters['utilisateur'] = $person;
        }
        if ($range = $this->dateRange($args)) {
            $query->whereBetween('created_at', $range);
            $filters['entre'] = [$this->local($range[0]), $this->local($range[1])];
        }

        $total = (clone $query)->count();
        $logs = $query->with(['user:id,name,role', 'library:id,name'])->orderByDesc('created_at')->orderByDesc('id')->limit(self::LOG_LIMIT)->get();

        if ($logs->isEmpty()) {
            return ['trouve' => false, 'total' => 0, 'filtres' => $filters, 'message' => 'Aucune action trouvée dans les données disponibles.', 'perimetre' => $this->perimeter($ids)];
        }

        $elements = $logs->map(fn (ActivityLog $l) => $l->subject_type . '#' . $l->subject_id)->unique();

        return [
            'trouve' => true,
            'total' => $total,
            'affiches' => $logs->count(),
            'actions' => $logs->map(fn (ActivityLog $l) => [
                'action' => self::ACTION_LABELS[$l->action] ?? $l->action,
                'element' => $l->subject_label ?? $l->description,
                'nature_element' => array_search($l->subject_type, self::ELEMENT_TYPES, true) ?: null,
                'effectuee_par' => $l->user?->name ?? 'Utilisateur inconnu ou supprimé',
                'role_auteur' => $l->user?->role,
                'bibliotheque' => $l->library?->name,
                'date' => $this->local($l->created_at, 'Y-m-d'),
                'heure' => $this->local($l->created_at, 'H:i'),
                'modifications' => $this->compactChanges($l->changes),
            ])->all(),
            'plusieurs_elements_differents' => $elements->count() > 1,
            'filtres' => $filters,
            'perimetre' => $this->perimeter($ids),
        ];
    }

    private function compactChanges(?array $changes): ?array
    {
        if (!$changes) {
            return null;
        }

        $cut = fn ($value) => is_array($value) ? implode(', ', $value) : ($value === null ? null : mb_substr((string) $value, 0, 120));

        return collect($changes)->map(fn ($c) => ['avant' => $cut($c['before'] ?? null), 'apres' => $cut($c['after'] ?? null)])->all();
    }

    private function allowedActions(): array
    {
        $actions = [...self::DOCUMENT_ACTIONS, ...self::LIBRARY_ACTIONS, ...self::USER_ACTIONS];

        return $this->scope->isAdmin() ? [...$actions, ...self::ADMIN_ONLY_ACTIONS] : $actions;
    }

    // ------------------------------------------------------------------ périmètre et filtres

    /**
     * @return array{0: ?array<int>, 1: ?array}  [identifiants de bibliothèque à imposer (null = toutes), erreur]
     */
    private function libraryIds(?string $name): array
    {
        if ($this->scope->isAdmin()) {
            if ($name === null) {
                return [null, null];
            }
            $ids = Library::query()->where('name', 'like', "%{$name}%")->pluck('id')->all();

            return $ids ? [$ids, null] : [null, ['trouve' => false, 'total' => 0, 'message' => "Aucune bibliothèque ne correspond à « {$name} » dans les données disponibles."]];
        }

        // Bibliothécaire : sa bibliothèque, toujours. Une autre bibliothèque demandée = aucune donnée.
        if ($name !== null && !$this->sameLibrary($name)) {
            return [null, $this->outOfScope()];
        }

        return [[$this->scope->libraryId], null];
    }

    private function sameLibrary(string $name): bool
    {
        $norm = fn (string $v) => Str::ascii(mb_strtolower(trim($v)));
        $own = $norm((string) $this->scope->libraryName);
        $asked = $norm($name);

        return $asked !== '' && ($own === $asked || str_contains($own, $asked) || str_contains($asked, $own));
    }

    private function outOfScope(): array
    {
        return [
            'trouve' => false,
            'hors_perimetre' => true,
            'message' => "Cette bibliothèque est hors de votre périmètre : vous ne pouvez consulter que les données de « {$this->scope->libraryName} ».",
        ];
    }

    private function perimeter(?array $ids): string
    {
        if (!$this->scope->isAdmin()) {
            return "Bibliothèque « {$this->scope->libraryName} »";
        }

        return $ids === null ? 'Toutes les bibliothèques' : Library::whereIn('id', $ids)->pluck('name')->implode(', ');
    }

    private function documents(?array $ids): Builder
    {
        return Document::query()->when($ids !== null, fn ($q) => $q->whereIn('documents.library_id', $ids));
    }

    /** Applique les critères communs ; retourne la liste des critères réellement appliqués. */
    private function applyDocumentFilters(Builder $query, array $args, bool $withStatus): array
    {
        $applied = [];

        if ($title = $this->text($args, 'titre')) {
            $query->where('documents.title', 'like', "%{$title}%");
            $applied['titre'] = $title;
        }
        if ($type = $this->text($args, 'type')) {
            $query->where('documents.type', 'like', "%{$type}%");
            $applied['type'] = $type;
        }
        if ($category = $this->text($args, 'categorie')) {
            $query->whereHas('category', fn ($q) => $q->where('name', 'like', "%{$category}%"));
            $applied['categorie'] = $category;
        }
        if ($withStatus && ($status = $this->choice($args, 'statut', self::STATUSES))) {
            $query->where('documents.status', $status);
            $applied['statut'] = $status;
        }

        return $applied;
    }

    // ------------------------------------------------------------------ validation des arguments

    private function text(array $args, string $key): ?string
    {
        $value = $args[$key] ?? null;

        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) && !is_numeric($value)) {
            throw new InvalidToolArguments("« {$key} » doit être un texte.");
        }

        $value = trim((string) $value);

        return $value === '' ? null : mb_substr($value, 0, 120);
    }

    private function choice(array $args, string $key, array $allowed): ?string
    {
        $value = $this->text($args, $key);

        if ($value === null) {
            return null;
        }
        if (!in_array($value, $allowed, true)) {
            throw new InvalidToolArguments("Valeur invalide pour « {$key} » : {$value}. Valeurs possibles : " . implode(', ', $allowed) . '.');
        }

        return $value;
    }

    private function timezone(): string
    {
        return config('app.display_timezone', 'Indian/Antananarivo');
    }

    private function parseDate(array $args, string $key): ?CarbonImmutable
    {
        $value = $this->text($args, $key);

        if ($value === null) {
            return null;
        }

        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? CarbonImmutable::createFromFormat('!Y-m-d', $value, $this->timezone()) : false;

        if (!$date || $date->format('Y-m-d') !== $value) {
            throw new InvalidToolArguments("« {$key} » doit être une date valide au format AAAA-MM-JJ.");
        }

        return $date;
    }

    /** Période en UTC (les jours sont ceux du fuseau local de l'application). */
    private function dateRange(array $args): ?array
    {
        $day = $this->parseDate($args, 'date');
        $from = $this->parseDate($args, 'date_debut');
        $to = $this->parseDate($args, 'date_fin');

        if ($day) {
            return [$day->startOfDay()->utc(), $day->endOfDay()->utc()];
        }
        if ($from || $to) {
            $start = ($from ?? CarbonImmutable::create(2000, 1, 1, 0, 0, 0, $this->timezone()))->startOfDay()->utc();
            $end = ($to ?? CarbonImmutable::now($this->timezone()))->endOfDay()->utc();

            if ($start->gt($end)) {
                throw new InvalidToolArguments('« date_debut » doit précéder « date_fin ».');
            }

            return [$start, $end];
        }

        return null;
    }

    private function local($date, string $format = 'Y-m-d H:i'): string
    {
        return CarbonImmutable::parse($date)->setTimezone($this->timezone())->format($format);
    }
}

// Arguments d'outil invalides : le message est renvoyé à Gemini pour qu'il corrige son appel.
final class InvalidToolArguments extends \InvalidArgumentException
{
}
