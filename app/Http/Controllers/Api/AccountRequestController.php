<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountRequest;
use App\Models\MemberRegistry;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AccountRequestController extends Controller
{
    // Un bibliothécaire ne traite que les demandes de sa propre bibliothèque (l'administrateur : toutes).
    private function authorizeRequestLibrary(User $user, AccountRequest $accountRequest): void
    {
        abort_unless($user->managesLibrary($accountRequest->library_id), 403, 'Cette demande appartient à une autre bibliothèque.');
    }

    /**
     * Liste des demandes de création de compte.
     */
    public function index(Request $request)
    {
        AccountRequest::whereIn('status', [
            'en_attente',
            'verifiee',
            'en_attente_validation',
        ])
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->update([
                'status' => 'expiree',
            ]);

        $query = AccountRequest::with([
            'library',
            'createdUser',
            'createdBy',
            'processedBy',
        ]);

        // Le bibliothécaire ne voit que les demandes de sa bibliothèque.
        $request->user()->restrictToManagedLibrary($query);

        // Compteurs : même périmètre que la liste, calculés avant d'appliquer le filtre de statut.
        $counts = $this->requestCounts(clone $query);

        if ($request->filled('status')) {
            // « validee » ne change jamais après la création du mot de passe : seul l'effacement du jeton
            // d'initialisation distingue « en attente de mot de passe » de « compte activé ».
            match ($request->status) {
                'validee' => $query->where('status', 'validee')->whereNotNull('setup_token_hash'),
                'compte_active' => $query->where('status', 'validee')->whereNull('setup_token_hash'),
                default => $query->where('status', $request->status),
            };
        }

        return response()->json([
            ...$query->latest()->paginate(20)->toArray(),
            'counts' => $counts,
        ]);
    }

    /** Total et nombre par statut dans le périmètre autorisé (une seule requête GROUP BY, aucune ligne chargée). */
    private function requestCounts($scoped): array
    {
        $rows = $scoped->reorder()->toBase()
            ->selectRaw("CASE WHEN status = 'validee' AND setup_token_hash IS NULL THEN 'compte_active' ELSE status END AS bucket, COUNT(*) AS total")
            ->groupBy('bucket')
            ->pluck('total', 'bucket');

        $counts = ['total' => (int) $rows->sum()];
        foreach (['en_attente', 'verifiee', 'validee', 'compte_active', 'rejetee', 'expiree', 'traitee'] as $status) {
            $counts[$status] = (int) ($rows[$status] ?? 0);
        }

        return $counts;
    }

    /**
     * Création publique d'une demande de compte étudiant.
     */
    public function store(Request $request)
    {
        $legacyRequest = !$request->filled('role')
            && !$request->filled('school')
            && !$request->filled('filiere');

        $rules = [
            'last_name' => ['required', 'string', 'max:100'],
            'first_name' => ['nullable', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'gender' => ['required', Rule::in(['masculin', 'feminin'])],
            'address' => ['required', 'string', 'max:255'],
            'library_id' => ['required', 'integer', 'exists:libraries,id'],
        ];

        if ($legacyRequest) {
            $rules['date_of_birth'] = ['nullable', 'date'];
            $rules['role'] = ['sometimes', Rule::in(['etudiant'])];
        } else {
            $rules += [
                'date_of_birth' => ['required', 'date'],
                'birth_place' => ['required', 'string', 'max:255'],
                'cin_number' => ['required', 'digits:12'],
                'cin_issued_at' => ['required', 'date'],
                'role' => ['required', Rule::in(['etudiant'])],
                'school' => ['required', Rule::in([
                    'IOSTM',
                    'IUGM',
                    'ISSTM',
                    'IUTAM',
                    'ILCSS',
                    'Faculté de Médecine',
                    "Faculté des sciences, technologies et de l'environnement (FSTE)",
                    'Ecoles et formations rattachées',
                ])],
                'filiere' => ['required', 'string', 'max:255'],
                'niveau_type' => ['required', Rule::in(['Université'])],
                'niveau_detail' => [
                    'nullable',
                    Rule::in(['L1', 'L2', 'L3', 'M1', 'M2', 'Doctorat']),
                ],
                'student_card_number' => ['required', 'string', 'max:255'],
            ];
        }

        $validated = $request->validate($rules);

        $validated['first_name'] = $validated['first_name'] ?? '';
        $validated['role'] = $validated['role'] ?? 'etudiant';
        $validated['niveau_type'] = $validated['niveau_type'] ?? 'Université';

        $emailExists = User::where('email', $validated['email'])->exists();

        if ($emailExists) {
            return response()->json([
                'message' => 'Un compte existe déjà avec cette adresse e-mail.',
            ], 422);
        }

        $requestExists = AccountRequest::where('email', $validated['email'])
            ->whereIn('status', [
                'en_attente',
                'verifiee',
                'en_attente_validation',
            ])
            ->exists();

        if ($requestExists) {
            return response()->json([
                'message' => 'Une demande de création de compte existe déjà pour cette adresse e-mail.',
            ], 422);
        }

        $validated['uuid'] = (string) Str::uuid();

        if (!$legacyRequest) {
            $validated['request_number'] =
                'REQ-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(5));
        }


        $validated['status'] = 'en_attente';
        $validated['expires_at'] = now()->addHours(24);

        $accountRequest = AccountRequest::create($validated);

        /**
         * Notification du Service Numérique.
         */
        NotificationService::sendToRole(
            'bibliothecaire',
            'account_request_created',
            'Nouvelle demande de création de compte',
            "Une nouvelle demande de création de compte étudiant a été reçue pour {$accountRequest->first_name} {$accountRequest->last_name}.",
            $accountRequest
        );

        NotificationService::sendToRole(
            'administrateur',
            'account_request_created',
            'Nouvelle demande de création de compte',
            "Une nouvelle demande de création de compte étudiant a été reçue pour {$accountRequest->first_name} {$accountRequest->last_name}.",
            $accountRequest
        );

        return response()->json([
            'message' => 'Votre demande de création de compte a été envoyée avec succès.',
            'status' => $accountRequest->status,
            'request_number' => $accountRequest->request_number,
            'request' => $accountRequest->load([
                'library',
                'createdBy',
                'processedBy',
            ]),
        ], 201);
    }

    /**
     * Création d'une demande de compte par le Service Numérique.
     *
     * La demande est directement placée dans "verifiee".
     * Elle attend ensuite uniquement la validation finale de l'administrateur.
     */
    public function storeByLibrarian(Request $request)
    {
        $user = $request->user();

        if (!$user || !$user->isLibrarian()) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        $validated = $request->validate([
            'last_name' => ['required', 'string', 'max:100'],
            'first_name' => ['nullable', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'gender' => ['required', Rule::in(['masculin', 'feminin'])],
            'address' => ['required', 'string', 'max:255'],

            'role' => [
                'required',
                Rule::in(['etudiant']),
            ],

            /**
             * Étudiant : mêmes champs et mêmes règles que le formulaire
             * d'ajout d'utilisateur de l'administrateur.
             */
            'date_of_birth' => ['required', 'date'],
            'birth_place' => ['required', 'string', 'max:255'],
            'cin_number' => ['required', 'digits:12'],
            'cin_issued_at' => ['required', 'date'],
            'student_card_number' => ['required', 'string', 'max:255'],
            'school' => ['required', Rule::in([
                'IOSTM',
                'IUGM',
                'ISSTM',
                'IUTAM',
                'ILCSS',
                'Faculté de Médecine',
                "Faculté des sciences, technologies et de l'environnement (FSTE)",
                'Ecoles et formations rattachées',
            ])],
            'filiere' => ['required', 'string', 'max:255'],
            'niveau_type' => [
                'nullable',
                Rule::in(['Université']),
            ],
            'niveau_detail' => [
                'nullable',
                Rule::in([
                    'L1',
                    'L2',
                    'L3',
                    'M1',
                    'M2',
                    'Doctorat',
                ]),
            ],

            /**
             * Enseignant
             */
            'faculty' => ['nullable', 'string', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:255'],
            'teaching_specialty' => ['nullable', 'string', 'max:255'],

            /**
             * Chercheur
             */
            'research_lab' => ['nullable', 'string', 'max:255'],
            'researcher_field' => ['nullable', 'string', 'max:255'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'profession' => ['nullable', 'string', 'max:255'],

            /**
             * Champs supplémentaires conservés pour compatibilité.
             */
            'diploma' => ['nullable', 'string', 'max:255'],
            'workplace' => ['nullable', 'string', 'max:255'],
            'experience' => ['nullable', 'string', 'max:255'],
        ]);

        /**
         * Vérification du compte existant.
         */
        $emailExists = User::where('email', $validated['email'])->exists();

        if ($emailExists) {
            return response()->json([
                'message' => 'Un compte existe déjà avec cette adresse e-mail.',
            ], 422);
        }

        /**
         * Vérification d'une demande déjà active.
         */
        $requestExists = AccountRequest::where('email', $validated['email'])
            ->whereIn('status', [
                'en_attente',
                'verifiee',
                'en_attente_validation',
            ])
            ->exists();

        if ($requestExists) {
            return response()->json([
                'message' => 'Une demande de création de compte existe déjà pour cette adresse e-mail.',
            ], 422);
        }

        /**
         * Pour un étudiant, le niveau est obligatoirement universitaire.
         */
        if ($validated['role'] === 'etudiant') {
            $validated['niveau_type'] = 'Université';

            if (empty($validated['niveau_detail'])) {
                return response()->json([
                    'message' => 'Le niveau universitaire est obligatoire pour un étudiant.',
                ], 422);
            }
        } else {
            /**
             * Les champs de niveau ne concernent pas
             * les enseignants et les chercheurs.
             */
            $validated['school'] = null;
            $validated['filiere'] = null;
            $validated['niveau_type'] = null;
            $validated['niveau_detail'] = null;
        }

        /**
         * Génération des identifiants de la demande.
         */
        $validated['uuid'] = (string) Str::uuid();

        $validated['request_number'] =
            'REQ-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(5));


        /**
         * Le Service Numérique crée la demande.
         *
         * created_by conserve l'identité de la personne
         * qui a créé la demande.
         *
         * processed_by sera utilisé plus tard par
         * l'administrateur lors de la validation ou du rejet.
         */
        $validated['created_by'] = $user->id;

        /**
         * La demande créée par le Service Numérique
         * est directement considérée comme vérifiée.
         *
         * L'administrateur devra ensuite effectuer
         * la validation finale.
         */
        $validated['status'] = 'verifiee';

        $validated['library_id'] = $user->library_id ?? null;

        if (!$validated['library_id']) {
            return response()->json(['message' => 'Le Service Numérique doit être rattaché à une bibliothèque.'], 422);
        }

        $validated['validation_deadline_at'] = now()->addHours(24);
        $validated['expires_at'] = now()->addHours(24);

        /**
         * Important :
         * on ne renseigne PAS processed_by ici,
         * car aucun traitement administratif final
         * n'a encore été effectué.
         */
        $accountRequest = AccountRequest::create($validated);

        /**
         * Notification des administrateurs.
         */
        NotificationService::sendToRole(
            'administrateur',
            'account_request_created',
            'Nouvelle demande de création de compte',
            "Le Service Numérique a créé une nouvelle demande de compte pour {$accountRequest->first_name} {$accountRequest->last_name}.",
            $accountRequest
        );

        /**
         * Information envoyée à la personne concernée.
         */
        try {
            Mail::send(
                'emails.account-request-created-by-librarian',
                [
                    'request' => $accountRequest,
                ],
                function ($message) use ($accountRequest) {
                    $message
                        ->to($accountRequest->email)
                        ->subject('Demande de création de compte transmise');
                }
            );
        } catch (\Throwable $e) {
            // L'échec de l'e-mail ne doit pas empêcher
            // la création de la demande.
        }

        return response()->json([
            'message' => 'La demande de création de compte a été envoyée à l’administrateur.',
            'request' => $accountRequest->load([
                'library',
                'createdBy',
                'processedBy',
            ]),
        ], 201);
    }

    /**
     * Création d'un compte à partir d'un ticket par le Service Numérique.
     */
    public function createAccount(Request $request, AccountRequest $accountRequest)
    {
        $user = $request->user();

        if (!$user || !in_array($user->role, ['administrateur', 'bibliothecaire'], true)) {
            return response()->json(['message' => 'Accès non autorisé.'], 403);
        }

        $this->authorizeRequestLibrary($user, $accountRequest);

        if (!in_array($accountRequest->status, ['en_attente', 'verifiee'], true)) {
            return response()->json(['message' => 'Ce ticket ne peut plus être traité.'], 422);
        }

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'role' => ['required', Rule::in(['etudiant', 'enseignant', 'chercheur'])],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $createdUser = DB::transaction(function () use ($accountRequest, $user, $validated) {
            $matricule = User::generateNumeroCompte($validated['role']);
            $createdUser = User::create([
                'name' => trim($accountRequest->first_name . ' ' . $accountRequest->last_name),
                'first_name' => $accountRequest->first_name,
                'last_name' => $accountRequest->last_name,
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'phone' => $accountRequest->phone,
                'address' => $accountRequest->address,
                'gender' => $accountRequest->gender,
                'date_of_birth' => $accountRequest->date_of_birth,
                'role' => $validated['role'],
                'matricule' => $matricule,
                'school' => $accountRequest->school,
                'filiere' => $accountRequest->filiere,
                'niveau_type' => $accountRequest->niveau_type,
                'niveau_detail' => $accountRequest->niveau_detail,
                'library_id' => $accountRequest->library_id,
                'is_active' => false,
            ]);

            MemberRegistry::firstOrCreate(
                ['user_id' => $createdUser->id],
                [
                    'library_id' => $accountRequest->library_id,
                    'matricule' => $matricule,
                    'role' => $validated['role'],
                    'last_name' => $accountRequest->last_name,
                    'first_name' => $accountRequest->first_name,
                    'email' => $validated['email'],
                    'phone' => $accountRequest->phone,
                    'address' => $accountRequest->address,
                    'gender' => $accountRequest->gender,
                    'status' => 'desactive',
                    'profile_data' => [],
                ]
            );

            $accountRequest->update([
                'status' => 'traitee',
                'processed_by' => $user->id,
                'processed_at' => now(),
                'created_user_id' => $createdUser->id,
            ]);

            return $createdUser;
        });

        ActivityLogService::log($user->id, 'creation_compte', "{$createdUser->name} — {$createdUser->role}", $createdUser);

        return response()->json([
            'message' => 'Le compte a été créé et reste en attente d’activation.',
            'user' => $createdUser,
            'request' => $accountRequest->fresh()->load(['library', 'createdUser', 'processedBy']),
        ], 201);
    }

    /**
     * Activation administrative d'un compte créé inactif.
     */
    public function activate(Request $request, User $user)
    {
        if (!$request->user()?->isAdmin()) {
            return response()->json(['message' => 'Accès non autorisé.'], 403);
        }

        $user->update(['is_active' => true]);

        return response()->json([
            'message' => 'Le compte a été activé.',
            'user' => $user->fresh(),
        ]);
    }

    /**
     * Affichage d'une demande de compte par son UUID.
     */
    public function show(string $uuid)
    {
        $accountRequest = AccountRequest::with([
            'library',
            'createdUser',
            'createdBy',
            'processedBy',
        ])
            ->where('uuid', $uuid)
            ->first();

        if (!$accountRequest) {
            return response()->json([
                'message' => "Cette demande n'existe pas.",
            ], 404);
        }

        return response()->json([
            'request' => [
                'id' => $accountRequest->id,
                'uuid' => $accountRequest->uuid,
                'request_number' => $accountRequest->request_number,
                'matricule' => $accountRequest->matricule,

                'status' => $accountRequest->status,
                'role' => $accountRequest->role,

                'last_name' => $accountRequest->last_name,
                'first_name' => $accountRequest->first_name,

                'email' => $accountRequest->email,
                'phone' => $accountRequest->phone,
                'gender' => $accountRequest->gender,
                'address' => $accountRequest->address,
                'date_of_birth' => $accountRequest->date_of_birth,

                'school' => $accountRequest->school,
                'filiere' => $accountRequest->filiere,
                'niveau_type' => $accountRequest->niveau_type,
                'niveau_detail' => $accountRequest->niveau_detail,
                'faculty' => $accountRequest->faculty,

                'department' => $accountRequest->department,
                'position' => $accountRequest->position,
                'teaching_specialty' => $accountRequest->teaching_specialty,

                'research_lab' => $accountRequest->research_lab,
                'researcher_field' => $accountRequest->researcher_field,
                'specialty' => $accountRequest->specialty,
                'profession' => $accountRequest->profession,

                'diploma' => $accountRequest->diploma,
                'workplace' => $accountRequest->workplace,
                'experience' => $accountRequest->experience,

                'library' => $accountRequest->library,
                'created_user' => $accountRequest->createdUser,
                'created_by' => $accountRequest->createdBy,
                'processed_by' => $accountRequest->processedBy,
            ],
        ]);
    }

    /**
     * Envoie un e-mail hors de la requête HTTP : l'appel SMTP (lent) ne bloque plus
     * le bouton. La tâche part dans la file « database », puis un worker éphémère est
     * lancé en arrière-plan ; un `queue:work` / `queue:listen` déjà actif la traite aussi.
     */
    private function queueMail(\Closure $send): void
    {
        dispatch($send);

        if (config('queue.default') !== 'database') {
            return;
        }

        try {
            $php = stripos(basename(PHP_BINARY), 'php') !== false ? PHP_BINARY : 'php';
            $worker = '"' . $php . '" "' . base_path('artisan') . '" queue:work --stop-when-empty --tries=1 --quiet';
            $command = PHP_OS_FAMILY === 'Windows'
                ? 'start /B "" ' . $worker . ' > NUL 2>&1'
                : $worker . ' > /dev/null 2>&1 &';
            pclose(popen($command, 'r'));
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Vérification d'une demande par le Service Numérique.
     */
    public function verify(Request $request, AccountRequest $accountRequest)
    {
        $user = $request->user();

        if (!$user || !$user->isLibrarian()) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        $this->authorizeRequestLibrary($user, $accountRequest);

        if ($accountRequest->status !== 'en_attente') {
            return response()->json([
                'message' => 'Cette demande ne peut plus être vérifiée.',
            ], 422);
        }

        $accountRequest->update([
            'status' => 'verifiee',
            'processed_by' => $user->id,
            'processed_at' => now(),
            'validation_deadline_at' => now()->addHours(24),
            'expires_at' => now()->addHours(24),
        ]);

        $this->queueMail(function () use ($accountRequest) {
            try {
                Mail::send(
                    'emails.account-request-verified',
                    [
                        'request' => $accountRequest,
                    ],
                    function ($message) use ($accountRequest) {
                        $message
                            ->to($accountRequest->email)
                            ->subject('Votre demande de compte a été vérifiée');
                    }
                );
            } catch (\Throwable $e) {
                report($e);
            }
        });

        NotificationService::sendToRole(
            'administrateur',
            'account_request_verified',
            'Demande de compte vérifiée',
            "La demande de {$accountRequest->first_name} {$accountRequest->last_name} a été vérifiée par le Service Numérique et attend votre validation.",
            $accountRequest
        );

        return response()->json([
            'message' => 'La demande a été vérifiée et transmise à l’administrateur.',
            'request' => $accountRequest->fresh()->load([
                'library',
                'createdBy',
                'processedBy',
            ]),
        ]);
    }

    /**
     * Rejet d'une demande par le Service Numérique.
     */
    public function reject(Request $request, AccountRequest $accountRequest)
    {
        $user = $request->user();

        if (!$user || !$user->isLibrarian()) {
            return response()->json(['message' => 'Accès non autorisé.'], 403);
        }

        $this->authorizeRequestLibrary($user, $accountRequest);

        if ($accountRequest->status !== 'en_attente') {
            return response()->json([
                'message' => 'Seules les demandes en attente peuvent être rejetées.',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $accountRequest->update([
            'status' => 'rejetee',
            'rejection_reason' => $validated['reason'] ?? null,
            'processed_by' => $user->id,
            'processed_at' => now(),
        ]);

        try {
            Mail::send(
                'emails.account-request-rejected',
                ['request' => $accountRequest],
                function ($message) use ($accountRequest) {
                    $message
                        ->to($accountRequest->email)
                        ->subject('Votre demande de compte a été rejetée');
                }
            );
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'message' => 'La demande a été rejetée.',
            'request' => $accountRequest->fresh()->load([
                'library',
                'createdBy',
                'processedBy',
            ]),
        ]);
    }

    /**
     * Rejet final par l'administrateur.
     */
    public function adminReject(Request $request, AccountRequest $accountRequest)
    {
        $user = $request->user();

        if (!$user || !$user->isAdmin()) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        if ($accountRequest->status !== 'verifiee') {
            return response()->json([
                'message' => 'Seules les demandes vérifiées peuvent être rejetées.',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $accountRequest->update([
            'status' => 'rejetee',
            'rejection_reason' => $validated['reason'] ?? null,

            /**
             * Ici, processed_by représente bien
             * l'administrateur qui a traité la demande.
             */
            'processed_by' => $user->id,
            'processed_at' => now(),
        ]);

        try {
            Mail::send(
                'emails.account-request-rejected',
                [
                    'request' => $accountRequest,
                ],
                function ($message) use ($accountRequest) {
                    $message
                        ->to($accountRequest->email)
                        ->subject('Votre demande de compte a été rejetée');
                }
            );
        } catch (\Throwable $e) {
            // Ne pas bloquer le processus si l'e-mail échoue.
        }

        NotificationService::sendToRole(
            'administrateur',
            'account_request_rejected',
            'Demande de compte rejetée',
            "La demande de {$accountRequest->first_name} {$accountRequest->last_name} a été rejetée par le Service Numérique.",
            $accountRequest
        );

        return response()->json([
            'message' => 'La demande a été rejetée.',
            'request' => $accountRequest->fresh()->load([
                'library',
                'createdBy',
                'processedBy',
            ]),
        ]);
    }

    /**
     * Validation finale par l'administrateur.
     */
    public function validateRequest(Request $request, AccountRequest $accountRequest)
    {
        $admin = $request->user();

        if (!$admin || (!$admin->isAdmin() && !$admin->hasPermission('valider_demande_compte'))) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        $this->authorizeRequestLibrary($admin, $accountRequest);

        if (
            in_array($accountRequest->status, ['validee', 'traitee'], true)
            && $accountRequest->created_user_id
        ) {
            return response()->json([
                'message' => 'Cette demande a déjà été traitée.',
                'request' => $accountRequest->load([
                    'library',
                    'createdUser',
                    'createdBy',
                    'processedBy',
                ]),
                'user' => $accountRequest->createdUser,
            ]);
        }

        if ($accountRequest->status !== 'verifiee') {
            return response()->json([
                'message' => 'Seules les demandes vérifiées peuvent être validées.',
            ], 422);
        }

        if (
            $accountRequest->validation_deadline_at &&
            now()->greaterThan($accountRequest->validation_deadline_at)
        ) {
            $accountRequest->update([
                'status' => 'expiree',
            ]);

            return response()->json([
                'message' => 'Le délai de validation de cette demande est dépassé.',
            ], 422);
        }

        $result = DB::transaction(function () use ($accountRequest, $admin) {
            $accountRequest = AccountRequest::whereKey($accountRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            if (
                in_array($accountRequest->status, ['validee', 'traitee'], true)
                && $accountRequest->created_user_id
            ) {
                return [
                    'user' => User::findOrFail($accountRequest->created_user_id),
                    'token' => null,
                    'already_processed' => true,
                ];
            }

            $existingUser = User::where(
                'email',
                $accountRequest->email
            )->first();

            if ($existingUser) {
                $user = $existingUser;
            } else {
                $user = User::create([
                    'name' => trim(
                        $accountRequest->first_name . ' ' . $accountRequest->last_name
                    ),
                    'first_name' => $accountRequest->first_name,
                    'last_name' => $accountRequest->last_name,
                    'email' => $accountRequest->email,
                    'password' => Hash::make(Str::random(64)),
                    'phone' => $accountRequest->phone,
                    'address' => $accountRequest->address,
                    'gender' => $accountRequest->gender,
                    'date_of_birth' => $accountRequest->date_of_birth,

                    'role' => $accountRequest->role,

                    // Le numéro de compte est créé uniquement au moment de la validation finale.
                    'matricule' => User::generateNumeroCompte($accountRequest->role),

                    'faculty' => $accountRequest->faculty,
                    'school' => $accountRequest->school,
                    'filiere' => $accountRequest->filiere,
                    'niveau_type' => $accountRequest->niveau_type,
                    'niveau_detail' => $accountRequest->niveau_detail,

                    'department' => $accountRequest->department,
                    'position' => $accountRequest->position,
                    'teaching_specialty' => $accountRequest->teaching_specialty,

                    'research_lab' => $accountRequest->research_lab,
                    'researcher_field' => $accountRequest->researcher_field,
                    'specialty' => $accountRequest->specialty,
                    'profession' => $accountRequest->profession,

                    'library_id' => $accountRequest->library_id,

                    'is_active' => false,
                ]);
            }

            /**
             * Enregistrement dans le registre des membres.
             */
            MemberRegistry::firstOrCreate(
                [
                    'user_id' => $user->id,
                ],
                [
                    'matricule' => $user->matricule,
                    'role' => $accountRequest->role,
                    'last_name' => $accountRequest->last_name,
                    'first_name' => $accountRequest->first_name,
                    'email' => $accountRequest->email,
                    'phone' => $accountRequest->phone,
                    'address' => $accountRequest->address,
                    'gender' => $accountRequest->gender,
                    'status' => 'desactive',
                    'profile_data' => [],
                ]
            );

            /**
             * Token sécurisé permettant à l'utilisateur
             * de définir son mot de passe.
             */
            $token = Str::random(64);

            $accountRequest->update([
                'status' => 'validee',
                'matricule' => $user->matricule,

                'setup_token_hash' => Hash::make($token),
                'setup_expires_at' => now()->addHours(24),

                /**
                 * Ici, processed_by = administrateur
                 * car c'est lui qui valide définitivement.
                 */
                'processed_by' => $admin->id,
                'processed_at' => now(),

                'created_user_id' => $user->id,
            ]);

            return [
                'user' => $user,
                'token' => $token,
                'already_processed' => false,
            ];
        });

        /**
         * Envoi du lien de création du mot de passe.
         */
        if (!$result['already_processed']) {
            ActivityLogService::log($admin->id, 'validation_compte', "{$result['user']->name} — {$result['user']->role}", $result['user']);

            $this->queueMail(function () use ($result, $accountRequest) {
                try {
                    Mail::send(
                        'emails.account-setup',
                        [
                            'user' => $result['user'],
                            'request' => $accountRequest,
                            'token' => $result['token'],
                        ],
                        function ($message) use ($result) {
                            $message
                                ->to($result['user']->email)
                                ->subject('Votre compte a été validé - création du mot de passe');
                        }
                    );
                } catch (\Throwable $e) {
                    report($e);
                }
            });
        }

        /**
         * Notification du Service Numérique.
         */
        NotificationService::sendToRole(
            'bibliothecaire',
            'account_request_validated',
            'Demande de compte validée',
            "La demande de {$accountRequest->first_name} {$accountRequest->last_name} a été validée par l'administrateur. Le lien de création du mot de passe a été envoyé.",
            $accountRequest
        );

        return response()->json([
            'message' => $result['already_processed']
                ? 'Cette demande a déjà été traitée.'
                : 'Le compte a été validé. Un lien de création du mot de passe a été envoyé.',
            'request' => $accountRequest->fresh()->load([
                'library',
                'createdUser',
                'createdBy',
                'processedBy',
            ]),
            'user' => $result['user'],
        ]);
    }

    /**
     * Validation de toutes les demandes vérifiées.
     */
    public function validateAll(Request $request)
    {
        $admin = $request->user();

        if (!$admin || !$admin->isAdmin()) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        $requests = AccountRequest::where('status', 'verifiee')->get();

        $validatedCount = 0;
        $errors = [];

        foreach ($requests as $accountRequest) {
            try {
                $fakeRequest = Request::create('/', 'POST');

                $fakeRequest->setUserResolver(
                    fn () => $admin
                );

                $response = $this->validateRequest(
                    $fakeRequest,
                    $accountRequest
                );

                if ($response->getStatusCode() === 200) {
                    $validatedCount++;
                }
            } catch (\Throwable $e) {
                $errors[] = [
                    'request_id' => $accountRequest->id,
                    'message' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'message' => "{$validatedCount} demande(s) validée(s).",
            'validated_count' => $validatedCount,
            'errors' => $errors,
        ]);
    }

    /**
     * Affichage du formulaire de création du mot de passe.
     */
    public function setupForm(string $token)
    {
        $accountRequest = AccountRequest::whereNotNull('setup_token_hash')
            ->where('status', 'validee')
            ->get()
            ->first(function ($request) use ($token) {
                return Hash::check($token, $request->setup_token_hash);
            });

        if (!$accountRequest) {
            return response()->json([
                'message' => 'Lien invalide ou expiré.',
            ], 404);
        }

        if (
            !$accountRequest->setup_expires_at ||
            now()->greaterThan($accountRequest->setup_expires_at)
        ) {
            return response()->json([
                'message' => 'Lien expiré.',
            ], 410);
        }

        return response()->json([
            'valid' => true,
            'request' => $accountRequest->load([
                'createdUser',
            ]),
        ]);
    }

    /**
     * Création du mot de passe.
     */
    public function setupPassword(Request $request, string $token)
    {
        $validated = $request->validate([
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
            ],
        ]);

        $accountRequest = AccountRequest::whereNotNull('setup_token_hash')
            ->where('status', 'validee')
            ->get()
            ->first(function ($request) use ($token) {
                return Hash::check($token, $request->setup_token_hash);
            });

        if (!$accountRequest) {
            return response()->json([
                'message' => 'Lien invalide ou expiré.',
            ], 404);
        }

        if (
            !$accountRequest->setup_expires_at ||
            now()->greaterThan($accountRequest->setup_expires_at)
        ) {
            return response()->json([
                'message' => 'Lien expiré.',
            ], 410);
        }

        $user = $accountRequest->createdUser;

        if (!$user) {
            return response()->json([
                'message' => 'Utilisateur associé introuvable.',
            ], 404);
        }

        $user->update([
            'password' => Hash::make($validated['password']),
            'is_active' => true,
        ]);

        $accountRequest->update([
            'setup_token_hash' => null,
            'setup_expires_at' => null,
        ]);

        return response()->json([
            'message' => 'Votre mot de passe a été créé. Votre compte est maintenant actif.',
        ]);
    }

    /**
     * Recréation / renvoi du lien de configuration.
     */
    public function recreate(Request $request)
    {
        $validated = $request->validate([
            'library_id' => ['required', 'integer', 'exists:libraries,id'],
            'card_number' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);

        $member = MemberRegistry::with('user')
            ->where('library_id', $validated['library_id'])
            ->where('card_number', trim($validated['card_number']))
            ->first();

        if (!$member) {
            return response()->json(['message' => 'Membre introuvable pour cette bibliothèque et ce numéro de carte.'], 404);
        }

        if ($member->user) {
            return response()->json(['message' => 'Ce membre possède déjà un compte numérique.'], 422);
        }

        if (User::where('email', $validated['email'])->exists()) {
            return response()->json(['message' => 'Un compte existe déjà avec cette adresse e-mail.'], 422);
        }

        $existingRequest = AccountRequest::where('library_id', $member->library_id)
            ->where('email', $validated['email'])
            ->whereIn('status', ['en_attente','verifiee','en_attente_validation'])
            ->exists();
        if ($existingRequest) {
            return response()->json(['message' => 'Une demande est déjà en cours pour cette adresse e-mail.'], 422);
        }

        $accountRequest = AccountRequest::create([
            'uuid' => (string) Str::uuid(),
            'request_number' => 'REQ-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(5)),
            'last_name' => $member->last_name,
            'first_name' => $member->first_name,
            'email' => $validated['email'],
            'phone' => $validated['phone'] ?: $member->phone,
            'address' => $validated['address'] ?: $member->address,
            'gender' => $member->gender,
            'role' => $member->role ?: 'etudiant',
            'library_id' => $member->library_id,
            'status' => 'en_attente',
            'created_by' => null,
            'expires_at' => now()->addDays(3),
            'validation_deadline_at' => now()->addDays(3),
        ]);

        NotificationService::sendToRole(
            'administrateur',
            'account_request_created',
            'Nouvelle demande d’un membre',
            "Le membre {$member->first_name} {$member->last_name} ({$member->card_number}) demande la création d’un compte numérique.",
            $accountRequest
        );

        return response()->json([
            'message' => 'Votre demande a été envoyée à l’administrateur.',
            'request' => $accountRequest->load(['library']),
        ], 201);
    }

    /**
     * Vérification d'un membre.
     */
    public function verifyMember(Request $request)
    {
        $validated = $request->validate([
            'library_id' => ['required', 'integer', 'exists:libraries,id'],
            'card_number' => ['required', 'string', 'max:80'],
        ]);

        $member = MemberRegistry::with(['user', 'library'])
            ->where('library_id', $validated['library_id'])
            ->where('card_number', trim($validated['card_number']))
            ->first();

        if (!$member) {
            return response()->json([
                'valid' => false,
                'message' => 'Aucun membre ne correspond à cette bibliothèque et à ce numéro de carte.',
            ], 404);
        }

        return response()->json([
            'valid' => true,
            'member' => $member,
            'has_account' => (bool) $member->user_id,
        ]);
    }

    /**
     * Renvoi manuel du lien de création du mot de passe (notamment lorsque le lien précédent a expiré).
     * Génère un nouveau jeton, prolonge le délai de 24h et renvoie l'e-mail.
     */
    public function sendSetupMail(Request $request, AccountRequest $accountRequest)
    {
        $admin = $request->user();

        if (!$admin || !in_array($admin->role, ['administrateur', 'bibliothecaire'], true)) {
            return response()->json(['message' => 'Accès non autorisé.'], 403);
        }

        $this->authorizeRequestLibrary($admin, $accountRequest);

        if (
            $accountRequest->status !== 'validee' ||
            !$accountRequest->created_user_id
        ) {
            return response()->json([
                'message' => 'Cette demande ne permet pas l’envoi d’un lien de configuration.',
            ], 422);
        }

        $createdUser = $accountRequest->createdUser;
        $token = Str::random(64);

        $accountRequest->update([
            'setup_token_hash' => Hash::make($token),
            'setup_expires_at' => now()->addHours(24),
        ]);

        $this->queueMail(function () use ($accountRequest, $createdUser, $token) {
            try {
                Mail::send(
                    'emails.account-setup',
                    [
                        'user' => $createdUser,
                        'request' => $accountRequest,
                        'token' => $token,
                        'variant' => 'new_link',
                    ],
                    function ($message) use ($accountRequest) {
                        $message
                            ->to($accountRequest->email)
                            ->subject('Création de votre mot de passe');
                    }
                );
            } catch (\Throwable $e) {
                report($e);
            }
        });

        ActivityLogService::log(
            $admin->id,
            'renvoi_lien_creation_mot_de_passe',
            $createdUser->name ?? $accountRequest->email,
            $createdUser
        );

        return response()->json([
            'message' => 'Le lien de création du mot de passe a été renvoyé.',
            'request' => $accountRequest->fresh()->load([
                'library',
                'createdUser',
                'createdBy',
                'processedBy',
            ]),
        ]);
    }

    /**
     * Envoi d'un e-mail libre lié à une demande.
     */
    public function sendMail(Request $request, AccountRequest $accountRequest)
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
        ]);

        Mail::send(
            'emails.notice',
            [
                'heading' => $validated['subject'],
                'paragraphs' => preg_split('/\R{2,}/', trim($validated['message'])),
            ],
            function ($mail) use ($accountRequest, $validated) {
                $mail
                    ->to($accountRequest->email)
                    ->subject($validated['subject']);
            }
        );

        return response()->json([
            'message' => 'E-mail envoyé avec succès.',
        ]);
    }

    /**
     * Création directe d'un utilisateur par l'administrateur.
     *
     * Le compte est créé inactif.
     * Une demande validée est également créée afin de réutiliser
     * le système existant de création du mot de passe par e-mail.
     */
    public function adminCreate(Request $request)
    {
        $admin = $request->user();

        if (!$admin || !$admin->isAdmin()) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        $validated = $request->validate([
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'max:50'],
            // L'adresse est facultative pour un chercheur, obligatoire pour les autres rôles.
            'address' => [Rule::requiredIf($request->input('role') !== 'chercheur'), 'nullable', 'string', 'max:255'],
            'library_id' => ['required', 'integer', 'exists:libraries,id'],
            'gender' => ['required', Rule::in(['masculin', 'feminin'])],
            'date_of_birth' => ['required', 'date'],
            'birth_place' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'string', 'max:255'],
            'cin_number' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'digits:12'],
            'cin_issued_at' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'date'],
            'student_card_number' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'string', 'max:255'],

            'role' => [
                'required',
                Rule::in([
                    'etudiant',
                    'enseignant',
                    'chercheur',
                ]),
            ],

            'faculty' => [Rule::requiredIf(in_array($request->input('role'), ['enseignant', 'chercheur'], true)), 'nullable', 'string', 'max:255'],
            'school' => [
                Rule::requiredIf($request->input('role') === 'etudiant'),
                'nullable',
                Rule::in([
                    'IOSTM', 'IUGM', 'ISSTM', 'IUTAM', 'ILCSS',
                    'Faculté de Médecine',
                    "Faculté des sciences, technologies et de l'environnement (FSTE)",
                    'Ecoles et formations rattachées',
                ]),
            ],
            'filiere' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'string', 'max:255'],

            'niveau_type' => [
                'nullable',
                Rule::in(['Université']),
            ],

            'niveau_detail' => [
                'nullable',
                Rule::in([
                    'L1',
                    'L2',
                    'L3',
                    'M1',
                    'M2',
                    'Doctorat',
                ]),
            ],

            'department' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:255'],
            'teaching_specialty' => [Rule::requiredIf($request->input('role') === 'enseignant'), 'nullable', 'string', 'max:255'],

            'research_lab' => ['nullable', 'string', 'max:255'],
            'researcher_field' => [Rule::requiredIf($request->input('role') === 'chercheur'), 'nullable', 'string', 'max:255'],
            'specialty' => [Rule::requiredIf($request->input('role') === 'chercheur'), 'nullable', 'string', 'max:255'],
            'profession' => ['nullable', 'string', 'max:255'],
        ]);

        /**
         * Pour un étudiant :
         * le niveau est toujours universitaire.
         */
        if ($validated['role'] === 'etudiant') {
            $validated['niveau_type'] = 'Université';
        } else {
            $validated['school'] = null;
            $validated['filiere'] = null;
            $validated['niveau_type'] = null;
            $validated['niveau_detail'] = null;
        }

        /**
         * Le compte est créé inactif.
         * L'utilisateur l'activera après avoir créé son mot de passe.
         */
        $validated['is_active'] = false;

        $validated['name'] = trim(
            $validated['first_name'] . ' ' . $validated['last_name']
        );

        /**
         * La colonne password est obligatoire.
         * On place donc un mot de passe temporaire aléatoire,
         * qui sera remplacé lorsque l'utilisateur définira
         * son véritable mot de passe.
         */
        $validated['password'] = Hash::make(Str::random(64));

        /**
         * Génération d'un matricule si nécessaire.
         */
        $matricule = User::generateNumeroCompte($validated['role']);

        /**
         * Génération de l'UUID si le modèle User l'utilise.
         */
        $validated['uuid'] = $validated['uuid'] ?? (string) Str::uuid();

        /**
         * Création du compte + demande de configuration
         * dans une seule transaction.
         */
        $result = DB::transaction(function () use (
            $validated,
            $admin,
            $matricule
        ) {
            /**
             * Création de l'utilisateur.
             */
            $user = User::create($validated);

            /**
             * Enregistrement dans le registre des membres.
             */
            MemberRegistry::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'library_id' => $validated['library_id'],
                    'matricule' => $matricule,
                    'role' => $validated['role'],
                    'last_name' => $validated['last_name'],
                    'first_name' => $validated['first_name'],
                    'email' => $validated['email'],
                    'phone' => $validated['phone'] ?? null,
                    'address' => $validated['address'] ?? null,
                    'gender' => $validated['gender'] ?? null,
                    'status' => 'desactive',
                    'profile_data' => [],
                ]
            );

            /**
             * Génération du token de création du mot de passe.
             *
             * Le token envoyé par e-mail est en clair.
             * La base de données ne conserve que son hash.
             */
            $token = Str::random(64);

            /**
             * Numéro de demande.
             */
            $requestNumber =
                'REQ-' .
                now()->format('YmdHis') .
                '-' .
                strtoupper(Str::random(5));

            /**
             * Création d'une demande déjà validée.
             *
             * Cela permet de réutiliser exactement le même
             * système setupForm() / setupPassword().
             */
            $accountRequest = AccountRequest::create([
                'uuid' => (string) Str::uuid(),
                'request_number' => $requestNumber,

                'last_name' => $validated['last_name'],
                'first_name' => $validated['first_name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'],
                'gender' => $validated['gender'],
                'address' => $validated['address'] ?? null,
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'birth_place' => $validated['birth_place'] ?? null,
                'cin_number' => $validated['cin_number'] ?? null,
                'cin_issued_at' => $validated['cin_issued_at'] ?? null,
                'student_card_number' => $validated['student_card_number'] ?? null,

                'role' => $validated['role'],

                'faculty' => $validated['faculty'] ?? null,
                'school' => $validated['school'] ?? null,
                'filiere' => $validated['filiere'] ?? null,

                'niveau_type' => $validated['niveau_type'] ?? null,
                'niveau_detail' => $validated['niveau_detail'] ?? null,

                'department' => $validated['department'] ?? null,
                'position' => $validated['position'] ?? null,
                'teaching_specialty' => $validated['teaching_specialty'] ?? null,

                'research_lab' => $validated['research_lab'] ?? null,
                'researcher_field' => $validated['researcher_field'] ?? null,
                'specialty' => $validated['specialty'] ?? null,
                'profession' => $validated['profession'] ?? null,

                'matricule' => $matricule,

                /**
                 * Demande créée directement par l'administrateur.
                 */
                'created_by' => $admin->id,

                /**
                 * Elle est déjà validée puisque l'administrateur
                 * vient de créer directement le compte.
                 */
                'status' => 'validee',

                /**
                 * Bibliothèque de l'administrateur.
                 */
                'library_id' => $validated['library_id'],

                'expires_at' => now()->addHours(24),

                /**
                 * Administrateur ayant effectué la création.
                 */
                'processed_by' => $admin->id,
                'processed_at' => now(),

                /**
                 * Utilisateur créé.
                 */
                'created_user_id' => $user->id,

                /**
                 * Lien de création du mot de passe.
                 */
                'setup_token_hash' => Hash::make($token),
                'setup_expires_at' => now()->addHours(24),

                'validation_deadline_at' => now()->addHours(24),
            ]);

            return [
                'user' => $user,
                'request' => $accountRequest,
                'token' => $token,
            ];
        });

        ActivityLogService::log($admin->id, 'creation_compte', "{$result['user']->name} — {$result['user']->role}", $result['user']);

        /**
         * Envoi du lien de création du mot de passe.
         */
        try {
            Mail::send(
                'emails.account-setup',
                [
                    'user' => $result['user'],
                    'request' => $result['request'],
                    'token' => $result['token'],
                    'variant' => 'created',
                ],
                function ($message) use ($result) {
                    $message
                        ->to($result['user']->email)
                        ->subject(
                            'Votre compte a été créé - création du mot de passe'
                        );
                }
            );
        } catch (\Throwable $e) {

            /**
             * Important : le compte reste créé même si
             * l'e-mail échoue.
             *
             * On enregistre l'erreur dans le fichier Laravel
             * pour pouvoir diagnostiquer le problème.
             */
            \Illuminate\Support\Facades\Log::error(
                'Erreur lors de l\'envoi du mail de création de mot de passe.',
                [
                    'user_id' => $result['user']->id,
                    'email' => $result['user']->email,
                    'error' => $e->getMessage(),
                ]
            );

            return response()->json([
                'message' =>
                    'Le compte a été créé, mais l’e-mail de création du mot de passe n’a pas pu être envoyé.',
                'user' => $result['user'],
            ], 201);
        }

        return response()->json([
            'message' =>
                'Utilisateur créé avec succès. Un lien de création du mot de passe a été envoyé par e-mail.',
            'user' => $result['user'],
        ], 201);
    }
}
