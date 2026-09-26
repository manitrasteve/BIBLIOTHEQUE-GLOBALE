<?php

namespace App\Services;

use App\Models\AccountRequest;
use App\Models\MemberRegistry;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Étapes communes à la création d'un compte membre, quel que soit le parcours
 * (validation d'une demande, création directe par l'administrateur, ticket du Service Numérique).
 */
class AccountProvisioner
{
    // Profil membre repris d'une demande de compte vers la fiche utilisateur.
    private const PROFILE_FIELDS = [
        'phone', 'address', 'gender', 'date_of_birth',
        'faculty', 'school', 'filiere', 'niveau_type', 'niveau_detail',
        'department', 'position', 'teaching_specialty',
        'research_lab', 'researcher_field', 'specialty', 'profession',
        'library_id',
    ];

    /** Compte inactif créé à partir d'une demande validée (le mot de passe sera défini via le lien). */
    public function createUserFromRequest(AccountRequest $request, string $matricule): User
    {
        return User::create([
            ...$request->only(self::PROFILE_FIELDS),
            'name' => trim($request->first_name.' '.$request->last_name),
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'password' => $this->unusablePassword(),
            'role' => $request->role,
            // Le numéro de compte est créé uniquement au moment de la validation finale.
            'matricule' => $matricule,
            'is_active' => false,
        ]);
    }

    /** Inscription au registre des membres (une seule fois par compte), statut « désactivé » jusqu'au mot de passe. */
    public function registerMember(User $user, array $identity, ?int $libraryId = null): MemberRegistry
    {
        return MemberRegistry::firstOrCreate(
            ['user_id' => $user->id],
            [
                'library_id' => $libraryId,
                'matricule' => $user->matricule,
                'role' => $identity['role'] ?? $user->role,
                'last_name' => $identity['last_name'] ?? null,
                'first_name' => $identity['first_name'] ?? null,
                'email' => $identity['email'] ?? $user->email,
                'phone' => $identity['phone'] ?? null,
                'address' => $identity['address'] ?? null,
                'gender' => $identity['gender'] ?? null,
                'status' => 'desactive',
                'profile_data' => [],
            ]
        );
    }

    /**
     * Jeton du lien « créer mon mot de passe » : [jeton en clair (e-mail), empreinte (base)].
     * La base ne conserve jamais le jeton en clair.
     */
    public function newSetupToken(): array
    {
        $token = Str::random(64);

        return [$token, Hash::make($token)];
    }

    // Mot de passe temporaire aléatoire (colonne obligatoire) : remplacé via le lien de création.
    public function unusablePassword(): string
    {
        return Hash::make(Str::random(64));
    }

    /** E-mail « créer votre mot de passe ». Lève une exception si l'envoi échoue : l'appelant décide quoi en faire. */
    public function sendSetupMail(User $user, AccountRequest $request, string $token, string $subject, ?string $variant = null, ?string $to = null): void
    {
        Mail::send(
            'emails.account-setup',
            array_filter(['user' => $user, 'request' => $request, 'token' => $token, 'variant' => $variant], fn ($v) => $v !== null),
            fn ($message) => $message->to($to ?? $user->email)->subject($subject)
        );
    }

    /** E-mail d'information sur une demande (vérifiée, rejetée…). Un échec est journalisé sans bloquer le traitement. */
    public function notifyRequester(AccountRequest $request, string $view, string $subject): void
    {
        try {
            Mail::send($view, ['request' => $request], fn ($message) => $message->to($request->email)->subject($subject));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
