<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountRequest;
use App\Models\MemberRegistry;
use App\Models\User;
use App\Rules\AvailableEmail;
use App\Services\AccountProvisioner;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use App\Support\AccountRequestRules as Rules;
use App\Support\QueueKicker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

// Demandes de compte : dépôt, vérification, rejet, validation, création directe et lien de mot de passe.
// Les règles de formulaire communes sont dans App\Support\AccountRequestRules, les étapes de
// création d'un compte (registre, jeton, e-mail) dans App\Services\AccountProvisioner.
class AccountRequestController extends Controller
{
    public function __construct(private AccountProvisioner $provisioner) {}

    // Un bibliothécaire ne traite que les demandes de sa propre bibliothèque (l'administrateur : toutes).
    private function authorizeRequestLibrary(User $user, AccountRequest $accountRequest): void
    {
        abort_unless($user->managesLibrary($accountRequest->library_id), 403, 'Cette demande appartient à une autre bibliothèque.');
    }

    // Une seule demande en cours par adresse e-mail.
    private function hasOpenRequest(string $email): bool
    {
        return AccountRequest::where('email', $email)->whereIn('status', Rules::OPEN_STATUSES)->exists();
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

        // Compte supprimé (Corbeille) : sa demande n'est plus affichée — elle réapparaît s'il est restauré.
        // (Après une suppression définitive, la demande est elle-même supprimée.)
        $query->where(fn ($q) => $q->whereNull('created_user_id')->orWhereHas('createdUser'));

        // Compteurs : même périmètre que la liste, calculés avant d'appliquer le filtre de statut.
        $counts = $this->requestCounts(clone $query);

        if ($request->filled('status') && str_contains($request->status, ',')) {
            // Carte « Total » : plusieurs statuts à la fois (« compte_active » est une demande « validee »).
            $statuses = collect(explode(',', $request->status))
                ->map(fn ($status) => $status === 'compte_active' ? 'validee' : trim($status))
                ->unique()
                ->values()
                ->all();
            $query->whereIn('status', $statuses);
        } elseif ($request->filled('status')) {
            // Une demande validée donne un compte actif tout de suite (mot de passe créé ou non) :
            // « compte_active » regroupe toutes les demandes « validee ».
            match ($request->status) {
                'compte_active', 'validee' => $query->where('status', 'validee'),
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
            ->selectRaw("CASE WHEN status = 'validee' THEN 'compte_active' ELSE status END AS bucket, COUNT(*) AS total")
            ->groupBy('bucket')
            ->pluck('total', 'bucket');

        $counts = ['total' => (int) $rows->sum()];
        foreach (['en_attente', 'verifiee', 'compte_active', 'rejetee', 'expiree', 'traitee'] as $status) {
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
        ];

        if ($legacyRequest) {
            $rules['date_of_birth'] = ['nullable', 'date'];
            $rules['role'] = ['sometimes', Rule::in(['etudiant'])];
        } else {
            $rules += [
                'date_of_birth' => ['required', 'date', 'before:today'],
                'birth_place' => ['required', 'string', 'max:255'],
                ...Rules::studentCinRules($request),
                'role' => ['required', Rule::in(['etudiant'])],
                'school' => ['required', Rule::in(Rules::SCHOOLS)],
                'filiere' => ['required', 'string', 'max:255'],
                'niveau_type' => ['required', Rule::in(['Université'])],
                'niveau_detail' => ['nullable', Rule::in(Rules::LEVELS)],
                'student_card_number' => ['required', 'string', 'max:255'],
            ];
        }

        $validated = $request->validate($rules, Rules::CIN_MESSAGES);
        if (!$legacyRequest) {
            $validated = Rules::withoutMinorCin($validated);
        }

        $validated['first_name'] = $validated['first_name'] ?? '';
        $validated['role'] = $validated['role'] ?? 'etudiant';
        $validated['niveau_type'] = $validated['niveau_type'] ?? 'Université';

        // Compte existant, y compris dans la corbeille (adresse libre après suppression définitive).
        if ($emailMessage = User::emailUnavailableMessage($validated['email'])) {
            return response()->json(['message' => $emailMessage], 422);
        }

        if ($this->hasOpenRequest($validated['email'])) {
            return response()->json([
                'message' => 'Une demande de création de compte existe déjà pour cette adresse e-mail.',
            ], 422);
        }

        $validated['uuid'] = (string) Str::uuid();

        if (!$legacyRequest) {
            $validated['request_number'] = Rules::newRequestNumber($validated);
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
            'date_of_birth' => ['required', 'date', 'before:today'],
            'birth_place' => ['required', 'string', 'max:255'],
            ...Rules::studentCinRules($request),
            'student_card_number' => ['required', 'string', 'max:255'],
            'school' => ['required', Rule::in(Rules::SCHOOLS)],
            'filiere' => ['required', 'string', 'max:255'],
            'niveau_type' => ['nullable', Rule::in(['Université'])],
            'niveau_detail' => ['nullable', Rule::in(Rules::LEVELS)],

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
        ], Rules::CIN_MESSAGES);
        $validated = Rules::withoutMinorCin($validated);

        // Compte existant, y compris dans la corbeille (adresse libre après suppression définitive).
        if ($emailMessage = User::emailUnavailableMessage($validated['email'])) {
            return response()->json(['message' => $emailMessage], 422);
        }

        if ($this->hasOpenRequest($validated['email'])) {
            return response()->json([
                'message' => 'Une demande de création de compte existe déjà pour cette adresse e-mail.',
            ], 422);
        }

        // Pour un étudiant, le niveau est obligatoirement universitaire (et précisé).
        if ($validated['role'] === 'etudiant' && empty($validated['niveau_detail'])) {
            return response()->json([
                'message' => 'Le niveau universitaire est obligatoire pour un étudiant.',
            ], 422);
        }
        $validated = Rules::normalizeLevel($validated);

        $validated['uuid'] = (string) Str::uuid();
        $validated['request_number'] = Rules::newRequestNumber($validated);

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

        // Information envoyée à la personne concernée (un échec n'empêche pas la création de la demande).
        $this->provisioner->notifyRequester($accountRequest, 'emails.account-request-created-by-librarian', 'Demande de création de compte transmise');

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
            'email' => ['required', 'email', 'max:255', new AvailableEmail()],
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

            $this->provisioner->registerMember($createdUser, [
                ...$accountRequest->only(['last_name', 'first_name', 'phone', 'address', 'gender']),
                'email' => $validated['email'],
            ], $accountRequest->library_id);

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
                // Route publique : jamais la fiche complète d'un compte (CIN, téléphone, adresse du personnel…).
                'created_user' => $accountRequest->createdUser?->only(['id', 'name', 'matricule']),
                'created_by' => $accountRequest->createdBy?->only(['id', 'name']),
                'processed_by' => $accountRequest->processedBy?->only(['id', 'name']),
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
        QueueKicker::dispatch($send);
    }

    /**
     * Vérification d'une demande par le Service Numérique ou l'administrateur.
     */
    public function verify(Request $request, AccountRequest $accountRequest)
    {
        $user = $request->user();

        if (!$user || !in_array($user->role, ['administrateur', 'bibliothecaire'], true)) {
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

        // static : la tâche mise en file ne sérialise que la demande et le service, pas le contrôleur.
        $provisioner = $this->provisioner;
        $this->queueMail(static fn () => $provisioner->notifyRequester($accountRequest, 'emails.account-request-verified', 'Votre demande de compte a été vérifiée'));

        // Vérifiée par l'administrateur : inutile de le notifier lui-même.
        if ($user->isLibrarian()) {
            NotificationService::sendToRole(
                'administrateur',
                'account_request_verified',
                'Demande de compte vérifiée',
                "La demande de {$accountRequest->first_name} {$accountRequest->last_name} a été vérifiée par le Service Numérique et attend votre validation.",
                $accountRequest
            );
        }

        return response()->json([
            'message' => $user->isLibrarian()
                ? 'La demande a été vérifiée et transmise à l’administrateur.'
                : 'La demande a été vérifiée.',
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

        $this->provisioner->notifyRequester($accountRequest, 'emails.account-request-rejected', 'Votre demande de compte a été rejetée');

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

        $this->authorizeRequestLibrary($user, $accountRequest);

        if (!in_array($accountRequest->status, ['en_attente', 'verifiee'], true)) {
            return response()->json([
                'message' => 'Seules les demandes en cours ou vérifiées peuvent être rejetées.',
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

        $this->provisioner->notifyRequester($accountRequest, 'emails.account-request-rejected', 'Votre demande de compte a été rejetée');

        NotificationService::sendToRole(
            'administrateur',
            'account_request_rejected',
            'Demande de compte rejetée',
            // Rejet final : c'est l'administrateur (et non le Service Numérique) qui a rejeté la demande.
            "La demande de {$accountRequest->first_name} {$accountRequest->last_name} a été rejetée par l'administrateur {$user->name}.",
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

        // L'administrateur valide directement une demande « non validée » (sans étape de vérification) ;
        // un bibliothécaire ne valide qu'une demande déjà vérifiée.
        $validatable = $admin->isAdmin() ? ['en_attente', 'verifiee'] : ['verifiee'];

        if (!in_array($accountRequest->status, $validatable, true)) {
            return response()->json([
                'message' => $admin->isAdmin()
                    ? 'Seules les demandes en cours ou vérifiées peuvent être validées.'
                    : 'Seules les demandes vérifiées peuvent être validées.',
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

        // Un compte supprimé mais encore dans la corbeille utilise cette adresse : aucun nouveau
        // compte ne peut être créé tant qu'il n'est pas restauré ou supprimé définitivement.
        if (User::onlyTrashed()->where('email', $accountRequest->email)->exists()) {
            return response()->json(['message' => User::emailUnavailableMessage($accountRequest->email)], 422);
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

            $user = User::where('email', $accountRequest->email)->first()
                ?? $this->provisioner->createUserFromRequest($accountRequest, User::generateNumeroCompte($accountRequest->role));

            $this->provisioner->registerMember($user, $accountRequest->only([
                'role', 'last_name', 'first_name', 'email', 'phone', 'address', 'gender',
            ]));

            // Jeton sécurisé permettant à l'utilisateur de définir son mot de passe.
            [$token, $tokenHash] = $this->provisioner->newSetupToken();

            $accountRequest->update([
                'status' => 'validee',
                'matricule' => $user->matricule,

                'setup_token_hash' => $tokenHash,
                'setup_expires_at' => now()->addHours(AccountRequest::SETUP_LINK_HOURS),

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

            // static : la tâche mise en file ne sérialise que ses données, pas le contrôleur.
            $provisioner = $this->provisioner;
            $this->queueMail(static function () use ($provisioner, $result, $accountRequest, $admin) {
                try {
                    $provisioner->sendSetupMail($result['user'], $accountRequest, $result['token'], 'Votre compte a été validé - création du mot de passe');
                } catch (\Throwable $e) {
                    report($e);
                    // Envoi en arrière-plan : l'administrateur est prévenu, sinon l'échec passerait inaperçu.
                    NotificationService::send(
                        $admin,
                        'envoi_email_echoue',
                        'E-mail non envoyé',
                        "Le lien de création du mot de passe n’a pas pu être envoyé à {$result['user']->email} (serveur de messagerie injoignable). Utilisez « Renvoyer le lien » dans Comptes à valider.",
                        $accountRequest
                    );
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
     * Validation groupée : les demandes sélectionnées (`ids`), ou toutes les demandes non validées et vérifiées.
     */
    public function validateAll(Request $request)
    {
        return $this->processMany($request, 'validate');
    }

    /**
     * Rejet groupé (motif obligatoire, envoyé à chaque demandeur) : les demandes sélectionnées (`ids`),
     * ou toutes les demandes non validées et vérifiées.
     */
    public function rejectAll(Request $request)
    {
        return $this->processMany($request, 'reject');
    }

    /**
     * Vérification groupée (Service Numérique ou administrateur) : les demandes non validées sélectionnées (`ids`),
     * limitées à la bibliothèque du bibliothécaire.
     */
    public function verifyAll(Request $request)
    {
        return $this->processMany($request, 'verify');
    }

    /** Applique la vérification, la validation ou le rejet unitaire à chaque demande, et en fait le bilan. */
    private function processMany(Request $request, string $action)
    {
        $admin = $request->user();

        $allowed = $action === 'verify'
            ? $admin && in_array($admin->role, ['administrateur', 'bibliothecaire'], true)
            : $admin && $admin->isAdmin();
        if (!$allowed) {
            return response()->json([
                'message' => 'Accès non autorisé.',
            ], 403);
        }

        $data = $request->validate([
            'ids' => ['sometimes', 'array'],
            'ids.*' => ['integer'],
            'reason' => [$action === 'reject' ? 'required' : 'nullable', 'string', 'max:1000'],
        ]);

        // Comme le traitement unitaire : vérification des demandes non validées ; validation / rejet (administrateur)
        // des demandes non validées ET vérifiées.
        $query = AccountRequest::whereIn('status', $action === 'verify' ? ['en_attente'] : ['en_attente', 'verifiee'])
            ->when(isset($data['ids']), fn ($query) => $query->whereIn('id', $data['ids']));
        $admin->restrictToManagedLibrary($query); // bibliothécaire : demandes de sa bibliothèque uniquement
        $requests = $query->get();

        $doneCount = 0;
        $errors = [];

        foreach ($requests as $accountRequest) {
            try {
                $fakeRequest = Request::create('/', 'POST', $action === 'reject' ? ['reason' => $data['reason']] : []);

                $fakeRequest->setUserResolver(
                    fn () => $admin
                );

                $response = match ($action) {
                    'reject' => $this->adminReject($fakeRequest, $accountRequest),
                    'verify' => $this->verify($fakeRequest, $accountRequest),
                    default => $this->validateRequest($fakeRequest, $accountRequest),
                };

                if ($response->getStatusCode() === 200) {
                    $doneCount++;
                } else {
                    $errors[] = [
                        'request_id' => $accountRequest->id,
                        'message' => $response->getData(true)['message'] ?? 'Traitement impossible.',
                    ];
                }
            } catch (\Throwable $e) {
                $errors[] = [
                    'request_id' => $accountRequest->id,
                    'message' => $e->getMessage(),
                ];
            }
        }

        $message = match ($action) {
            'reject' => "{$doneCount} demande(s) rejetée(s).",
            'verify' => "{$doneCount} demande(s) vérifiée(s)".($admin->isLibrarian() ? ' et transmise(s) à l’administrateur.' : '.'),
            default => "{$doneCount} demande(s) validée(s).",
        };
        if ($errors) {
            $message .= ' '.count($errors).' demande(s) non traitée(s) (délai dépassé, adresse indisponible…).';
        }

        return response()->json([
            'message' => $message,
            ['reject' => 'rejected_count', 'verify' => 'verified_count'][$action] ?? 'validated_count' => $doneCount,
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

        // Même effet qu'une création via le lien de réinitialisation (AuthController::resetPassword) :
        // compte actif, e-mail vérifié (le lien y a été reçu) et membre « actif » dans le registre.
        $user->update([
            'password' => Hash::make($validated['password']),
            'is_active' => true,
            'password_set_at' => now(),
            'email_verified_at' => $user->email_verified_at ?: now(),
        ]);
        MemberRegistry::where('user_id', $user->id)->update(['status' => 'actif']);

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

        if ($emailMessage = User::emailUnavailableMessage($validated['email'])) {
            return response()->json(['message' => $emailMessage], 422);
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
            'request_number' => Rules::newRequestNumber([
                'school' => User::whereKey($member->user_id)->value('school'),
                'role' => $member->role ?: 'etudiant',
            ]),
            'last_name' => $member->last_name,
            'first_name' => $member->first_name,
            'email' => $validated['email'],
            // Champs facultatifs : absents de $validated s'ils ne sont pas envoyés.
            'phone' => ($validated['phone'] ?? null) ?: $member->phone,
            'address' => ($validated['address'] ?? null) ?: $member->address,
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

        $member = MemberRegistry::where('library_id', $validated['library_id'])
            ->where('card_number', trim($validated['card_number']))
            ->first();

        if (!$member) {
            return response()->json([
                'valid' => false,
                'message' => 'Aucun membre ne correspond à cette bibliothèque et à ce numéro de carte.',
            ], 404);
        }

        // Endpoint public (pas d'authentification) : on ne renvoie jamais l'e-mail,
        // le téléphone, l'adresse ou le genre du membre, seulement de quoi
        // personnaliser l'étape suivante et savoir si un compte existe déjà.
        return response()->json([
            'valid' => true,
            'first_name' => $member->first_name,
            'has_account' => (bool) $member->user_id,
        ]);
    }

    /**
     * Renvoi manuel du lien de création du mot de passe (notamment lorsque le lien précédent a expiré).
     * Génère un nouveau jeton, prolonge le délai de validité et renvoie l'e-mail.
     */
    public function sendSetupMail(Request $request, AccountRequest $accountRequest)
    {
        $admin = $request->user();

        if (!$admin || !in_array($admin->role, ['administrateur', 'bibliothecaire'], true)) {
            return response()->json(['message' => 'Accès non autorisé.'], 403);
        }

        $this->authorizeRequestLibrary($admin, $accountRequest);

        if ($accountRequest->status !== 'validee') {
            return response()->json([
                'message' => 'Cette demande ne permet pas l’envoi d’un lien de configuration.',
            ], 422);
        }

        $createdUser = User::withTrashed()->find($accountRequest->created_user_id);

        // Compte dans la Corbeille : sa restauration renvoie automatiquement un nouveau lien.
        if ($createdUser?->trashed()) {
            return response()->json([
                'message' => 'Le compte de cette demande se trouve dans la Corbeille. Restaurez-le depuis la Corbeille : un nouveau lien de création du mot de passe lui sera envoyé automatiquement.',
            ], 422);
        }

        // Compte supprimé définitivement : aucun lien ne peut plus aboutir. La demande est retirée du
        // système avec son compte ; la personne doit refaire une demande.
        if (!$createdUser) {
            $accountRequest->delete();

            return response()->json([
                'message' => 'Le compte associé à cette demande a été supprimé définitivement : le lien ne peut plus être renvoyé et la demande a été retirée. La personne doit refaire une demande de compte.',
            ], 422);
        }

        [$token, $tokenHash] = $this->provisioner->newSetupToken();

        $accountRequest->update([
            'setup_token_hash' => $tokenHash,
            'setup_expires_at' => now()->addHours(AccountRequest::SETUP_LINK_HOURS),
        ]);

        // Envoi immédiat (et non en file) : un seul e-mail, demandé explicitement ; l'administrateur
        // doit savoir s'il est réellement parti, pour ne pas croire à tort que le lien a été reçu.
        try {
            $this->provisioner->sendSetupMail($createdUser, $accountRequest, $token, 'Création de votre mot de passe', 'new_link', $accountRequest->email);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Renvoi du lien de création du mot de passe impossible.', [
                'account_request_id' => $accountRequest->id,
                'email' => $accountRequest->email,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'L’e-mail n’a pas pu être envoyé : le serveur de messagerie est injoignable. Vérifiez la connexion Internet du serveur, puis réessayez.',
            ], 503);
        }

        ActivityLogService::log(
            $admin->id,
            'renvoi_lien_creation_mot_de_passe',
            $createdUser->name ?? $accountRequest->email,
            $createdUser
        );

        return response()->json([
            'message' => "Le lien de création du mot de passe a été renvoyé à {$accountRequest->email}.",
            'request' => $accountRequest->fresh()->load([
                'library',
                'createdUser',
                'createdBy',
                'processedBy',
            ]),
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
            'email' => ['required', 'email', 'max:255', new AvailableEmail()],
            'phone' => ['required', 'string', 'max:50'],
            // L'adresse est facultative pour un chercheur, obligatoire pour les autres rôles.
            'address' => [Rule::requiredIf($request->input('role') !== 'chercheur'), 'nullable', 'string', 'max:255'],
            'gender' => ['required', Rule::in(['masculin', 'feminin'])],
            'date_of_birth' => ['required', 'date', 'before:today'],
            'birth_place' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'string', 'max:255'],
            ...Rules::studentCinRules($request, $request->input('role') === 'etudiant'),
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
            'school' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', Rule::in(Rules::SCHOOLS)],
            'filiere' => [Rule::requiredIf($request->input('role') === 'etudiant'), 'nullable', 'string', 'max:255'],
            'niveau_type' => ['nullable', Rule::in(['Université'])],
            'niveau_detail' => ['nullable', Rule::in(Rules::LEVELS)],

            'department' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'string', 'max:255'],
            'teaching_specialty' => [Rule::requiredIf($request->input('role') === 'enseignant'), 'nullable', 'string', 'max:255'],

            'research_lab' => ['nullable', 'string', 'max:255'],
            'researcher_field' => [Rule::requiredIf($request->input('role') === 'chercheur'), 'nullable', 'string', 'max:255'],
            'specialty' => [Rule::requiredIf($request->input('role') === 'chercheur'), 'nullable', 'string', 'max:255'],
            'profession' => ['nullable', 'string', 'max:255'],
        ], Rules::CIN_MESSAGES);

        if ($validated['role'] === 'etudiant') {
            $validated = Rules::withoutMinorCin($validated);
        }
        $validated = Rules::normalizeLevel($validated);

        // Compte actif dès la création ; la connexion attend le mot de passe (temporaire inutilisable).
        $validated['is_active'] = true;
        $validated['first_name'] = $validated['first_name'] ?? null; // facultatif : absent s'il n'est pas envoyé
        $validated['name'] = trim($validated['first_name'].' '.$validated['last_name']);
        $validated['password'] = $this->provisioner->unusablePassword();

        // Numéro de compte : enregistré sur le compte lui-même (il manquait auparavant, seuls la demande
        // et le registre le recevaient), comme pour une demande validée.
        $matricule = User::generateNumeroCompte($validated['role']);
        $validated['matricule'] = $matricule;

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

            $this->provisioner->registerMember($user, $validated);

            // Lien de création du mot de passe : jeton en clair dans l'e-mail, empreinte en base.
            [$token, $tokenHash] = $this->provisioner->newSetupToken();

            $requestNumber = Rules::newRequestNumber($validated);

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
                 * Bibliothèque Numérique Globale : plus de bibliothèque unique imposée à la création.
                 */
                'library_id' => $validated['library_id'] ?? null,

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
                'setup_token_hash' => $tokenHash,
                'setup_expires_at' => now()->addHours(AccountRequest::SETUP_LINK_HOURS),

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
            $this->provisioner->sendSetupMail($result['user'], $result['request'], $result['token'], 'Votre compte a été créé - création du mot de passe', 'created');
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
                    'Le compte a été créé, mais l’e-mail de création du mot de passe n’a pas pu être envoyé (serveur de messagerie injoignable). '
                    . 'Renvoyez le lien depuis « Comptes à valider » avec le bouton « Renvoyer le lien ».',
                'user' => $result['user'],
                'mail_sent' => false,
            ], 201);
        }

        return response()->json([
            'message' =>
                "Utilisateur créé avec succès. Un lien de création du mot de passe a été envoyé à {$result['user']->email}.",
            'user' => $result['user'],
            'mail_sent' => true,
        ], 201);
    }
}
