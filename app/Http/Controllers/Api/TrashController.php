<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Document;
use App\Models\MemberRegistry;
use App\Models\AccountRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class TrashController extends Controller
{
    private function guard(Request $request, string $permission): void
    {
        abort_unless($request->user()?->hasPermission($permission), 403);
    }

    public function index(Request $request)
    {
        $this->guard($request, 'voir_corbeille');

        return response()->json([
            'users' => User::onlyTrashed()
                ->with('library:id,name')
                ->orderByDesc('deleted_at')
                ->get(),

            'documents' => Document::onlyTrashed()
                ->with('library:id,name')
                ->orderByDesc('deleted_at')
                ->get(),
        ]);
    }

    public function restoreUser(Request $request, int $id)
    {
        $this->guard($request, 'restaurer_corbeille');

        // Récupérer le compte supprimé
        $user = User::onlyTrashed()->findOrFail($id);

        // Restaurer le compte
        $user->restore();

        /*
         * Rechercher la demande de compte associée.
         *
         * Le lien entre User et AccountRequest est :
         * AccountRequest.created_user_id = User.id
         */
        $accountRequest = AccountRequest::where('created_user_id', $user->id)
            ->latest()
            ->first();

        /*
         * Si une demande de compte existe :
         *
         * - créer un nouveau token
         * - stocker uniquement son hash
         * - rendre le lien valable 3 jours
         * - remettre la demande à "validee"
         * - invalider l'ancien mot de passe
         * - envoyer l'e-mail à l'utilisateur
         */
        if ($accountRequest) {
            $token = Str::random(64);

            $accountRequest->update([
                'status' => 'validee',
                'setup_token_hash' => Hash::make($token),
                'setup_expires_at' => now()->addDay(),
            ]);

            /*
             * On force l'utilisateur à définir un nouveau mot de passe
             * avec le lien reçu par e-mail.
             */
            $user->update([
                'password' => Hash::make(Str::random(64)),
                'password_set_at' => null,
                'is_active' => false,
            ]);

            $this->sendRestoreMail($accountRequest, $user, $token);
        }

        /*
         * Restaurer également le registre du membre.
         */
        $registry = MemberRegistry::where('matricule', $user->matricule)->first();

        if ($registry) {
            $registry->update([
                'user_id' => $user->id,
                'status' => 'desactive',
            ]);
        }

        return response()->json(
            $user->load('library')
        );
    }

    public function restoreDocument(Request $request, int $id)
    {
        $this->guard($request, 'restaurer_corbeille');

        $doc = Document::onlyTrashed()->findOrFail($id);
        $doc->restore();
        // Une restauration depuis la corbeille ne republie jamais le document.
        $doc->update(['status' => 'brouillon', 'published_at' => null]);

        return response()->json($doc->fresh());
    }

    public function forceUser(Request $request, int $id)
    {
        $this->guard($request, 'supprimer_definitivement_corbeille');

        $user = User::onlyTrashed()->findOrFail($id);

        abort_if(
            $user->role === 'administrateur',
            422,
            'Un administrateur ne peut pas être supprimé définitivement.'
        );

        $user->forceDelete();

        return response()->json([
            'message' => 'Compte supprimé définitivement.'
        ]);
    }

    public function forceDocument(Request $request, int $id)
    {
        $this->guard($request, 'supprimer_definitivement_corbeille');

        Document::onlyTrashed()
            ->findOrFail($id)
            ->forceDelete();

        return response()->json([
            'message' => 'Document supprimé définitivement.'
        ]);
    }

    public function empty(Request $request)
    {
        $this->guard($request, 'supprimer_definitivement_corbeille');

        User::onlyTrashed()
            ->where('role', '!=', 'administrateur')
            ->forceDelete();

        Document::onlyTrashed()->forceDelete();

        return response()->json([
            'message' => 'La corbeille a été vidée définitivement.'
        ]);
    }

    /**
     * Envoie l'e-mail après restauration du compte.
     */
    private function sendRestoreMail(
        AccountRequest $accountRequest,
        User $user,
        string $token
    ): void {
        $url = rtrim(config('app.url'), '/')
            . '/creer-mot-de-passe?token='
            . urlencode($token);

        $matricule = $user->matricule
            ?? $accountRequest->matricule
            ?? '—';

        $body =
            "Bonjour {$user->name},\n\n"

            . "Votre compte de la Bibliothèque Numérique de l’Université de Mahajanga "
            . "a été restauré par l’administrateur.\n\n"

            . "Votre numéro de compte est : {$matricule}\n\n"

            . "⚠️ IMPORTANT : veuillez conserver précieusement votre numéro de compte."
            . "Ce numéro est important et pourra vous être demandé notamment en cas de "
            . "perte de vos informations de compte ou pour retrouver votre dossier.\n\n"

            . "Pour des raisons de sécurité, vous devez créer un nouveau mot de passe "
            . "avant de pouvoir utiliser votre compte.\n\n"

            . "Cliquez sur le lien sécurisé suivant pour créer votre nouveau mot de passe :\n"
            . "{$url}\n\n"

            . "Attention : ce lien est valable pendant 24 heures et ne peut être utilisé "
            . "qu'une seule fois.\n\n"

            . "Référence de votre demande : {$accountRequest->request_number}\n\n"

            . "La Bibliothèque Numérique de l’Université de Mahajanga";

        try {
            Mail::raw(
                $body,
                function ($message) use ($user) {
                    $message
                        ->to($user->email)
                        ->subject(
                            'Votre compte a été restauré — créez votre nouveau mot de passe'
                        );
                }
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
