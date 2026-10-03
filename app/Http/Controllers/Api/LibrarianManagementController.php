<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountRequest;
use App\Models\MemberRegistry;
use App\Models\User;
use App\Rules\AvailableEmail;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class LibrarianManagementController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(
            User::where('role', 'bibliothecaire')->orderByDesc('created_at')->get()
        );
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);

        $data = $request->validate([
            'last_name' => ['required', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', new AvailableEmail()],
            'phone' => ['required', 'string', 'max:50'],
            'address' => ['required', 'string', 'max:255'],
            'gender' => ['required', 'in:masculin,feminin'],
            'cin_number' => ['required', 'digits:12'],
            'cin_issued_at' => ['required', 'date'],
        ]);

        $user = User::create([
            'name' => trim(($data['first_name'] ?? '') . ' ' . $data['last_name']),
            'email' => mb_strtolower(trim($data['email'])),
            'password' => Hash::make(Str::random(64)),
            'password_set_at' => null,
            'role' => 'bibliothecaire',
            'address' => $data['address'],
            'phone' => $data['phone'],
            'gender' => $data['gender'],
            'cin_number' => $data['cin_number'],
            'cin_issued_at' => $data['cin_issued_at'],
            'is_active' => false,
        ]);

        // Numéro de compte issu de la séquence verrouillée (jamais réutilisé).
        $matricule = User::generateNumeroCompte('bibliothecaire');
        $user->update(['matricule' => $matricule]);

        MemberRegistry::create([
            'matricule' => $matricule,
            'user_id' => $user->id,
            'role' => 'bibliothecaire',
            'last_name' => $data['last_name'],
            'first_name' => $data['first_name'] ?? '', // prénom facultatif
            'email' => $user->email,
            'phone' => $user->phone,
            'address' => $user->address,
            'gender' => $user->gender,
            'status' => 'desactive',
            'profile_data' => [],
        ]);

        $mailSent = $this->sendSetupLink($user, $matricule);

        ActivityLogService::log($request->user()->id, 'creation_bibliothecaire', $user->name, $user);

        return response()->json([
            'user' => $user->fresh(),
            'mail_sent' => $mailSent,
            'message' => $mailSent
                ? "Bibliothécaire créé. Un lien de création du mot de passe a été envoyé à {$user->email}."
                : 'Bibliothécaire créé, mais l’e-mail n’a pas pu être envoyé (serveur de messagerie injoignable). '
                    . 'Utilisez « Renvoyer le lien » sur sa ligne dès que la connexion est rétablie.',
        ], 201);
    }

    /**
     * Renvoi du lien de création du mot de passe à un bibliothécaire qui ne l'a pas encore créé
     * (e-mail non reçu ou lien expiré). Le nouveau lien remplace le précédent.
     */
    public function resendSetupLink(Request $request, User $librarian)
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($librarian->role === 'bibliothecaire', 404);

        if ($librarian->password_set_at !== null) {
            return response()->json(['message' => 'Ce bibliothécaire a déjà créé son mot de passe.'], 422);
        }

        if (! $this->sendSetupLink($librarian, $librarian->matricule)) {
            return response()->json([
                'message' => 'L’e-mail n’a pas pu être envoyé : le serveur de messagerie est injoignable. Vérifiez la connexion Internet du serveur, puis réessayez.',
            ], 503);
        }

        ActivityLogService::log($request->user()->id, 'renvoi_lien_creation_mot_de_passe', $librarian->name, $librarian);

        return response()->json(['message' => "Le lien de création du mot de passe a été renvoyé à {$librarian->email}."]);
    }

    /** Nouveau lien de création du mot de passe (remplace le précédent) envoyé par e-mail ; false si l'envoi échoue. */
    private function sendSetupLink(User $user, ?string $matricule): bool
    {
        $token = Str::random(64);
        \Illuminate\Support\Facades\DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => Hash::make($token), 'created_at' => now()]
        );
        $url = rtrim(config('app.url'), '/') . '/reinitialiser-mot-de-passe?token=' . urlencode($token) . '&email=' . urlencode($user->email) . '&type=creation'; // même page que la réinitialisation, avec le vocabulaire « créer »

        $content = [
            'heading' => 'Votre compte Bibliothécaire a été créé',
            'paragraphs' => [
                "Bonjour {$user->name},",
                'Votre compte a été créé par l’administrateur de la Bibliothèque Numérique.',
                'Vous pouvez maintenant créer votre mot de passe.',
            ],
            'details' => [
                'Numéro de compte' => $matricule,
                'Adresse e-mail' => $user->email,
            ],
            'buttonLabel' => 'Créer mon mot de passe',
            'buttonUrl' => $url,
            'note' => 'Ce lien est valable pendant ' . AccountRequest::SETUP_LINK_HOURS . ' heures et ne peut être utilisé qu’une seule fois.',
            'footerNote' => 'Conservez précieusement votre numéro de compte.',
        ];

        try {
            Mail::send('emails.notice', $content, fn ($message) => $message
                ->to($user->email)
                ->subject('Votre compte Bibliothèque a été créé par l’administrateur'));

            return true;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Envoi du lien de création du mot de passe (bibliothécaire) impossible.', [
                'user_id' => $user->id,
                'email' => $user->email,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
