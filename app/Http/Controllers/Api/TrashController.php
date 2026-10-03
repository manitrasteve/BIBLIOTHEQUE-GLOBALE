<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Document;
use App\Models\MemberRegistry;
use App\Models\AccountRequest;
use App\Services\ActivityLogService;
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

        $me = $request->user();

        // Le bibliothécaire ne voit que la corbeille de sa bibliothèque.
        return response()->json([
            'users' => $me->restrictToManagedLibrary(User::onlyTrashed())
                ->with('library:id,name')
                ->orderByDesc('deleted_at')
                ->get(),

            'documents' => $me->restrictToManagedLibrary(Document::onlyTrashed())
                ->with('library:id,name')
                ->orderByDesc('deleted_at')
                ->get(),
        ]);
    }

    // Élément d'une autre bibliothèque : introuvable pour un bibliothécaire (pas de fuite d'existence).
    private function trashed(Request $request, string $model, int $id)
    {
        return $request->user()->restrictToManagedLibrary($model::onlyTrashed())->findOrFail($id);
    }

    public function restoreUser(Request $request, int $id)
    {
        $this->guard($request, 'restaurer_corbeille');

        // Récupérer le compte supprimé
        $user = $this->trashed($request, User::class, $id);

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
                'setup_expires_at' => now()->addHours(AccountRequest::SETUP_LINK_HOURS),
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

        ActivityLogService::log($request->user()->id, 'restauration_utilisateur', $user->name, $user);

        return response()->json(
            $user->load('library')
        );
    }

    public function restoreDocument(Request $request, int $id)
    {
        $this->guard($request, 'restaurer_corbeille');

        $doc = $this->trashed($request, Document::class, $id);
        $previousStatus = $doc->status;
        $doc->restore();
        // Une restauration depuis la corbeille ne republie jamais le document.
        $doc->update(['status' => 'brouillon', 'published_at' => null]);

        ActivityLogService::log(
            $request->user()->id,
            'restauration_document',
            $doc->title,
            $doc,
            ['status' => ['before' => $previousStatus, 'after' => 'brouillon']],
        );

        return response()->json($doc->fresh());
    }

    public function forceUser(Request $request, int $id)
    {
        $this->guard($request, 'supprimer_definitivement_corbeille');

        $user = $this->trashed($request, User::class, $id);

        abort_if(
            $user->role === 'administrateur',
            422,
            'Un administrateur ne peut pas être supprimé définitivement.'
        );

        AccountRequest::deleteForDeletedAccounts([$user->id]);
        $user->forceDelete();

        ActivityLogService::log($request->user()->id, 'suppression_definitive_utilisateur', $user->name, $user);

        return response()->json([
            'message' => 'Compte supprimé définitivement.'
        ]);
    }

    public function forceDocument(Request $request, int $id)
    {
        $this->guard($request, 'supprimer_definitivement_corbeille');

        $document = $this->trashed($request, Document::class, $id);
        $document->forceDelete();

        ActivityLogService::log($request->user()->id, 'suppression_definitive_document', $document->title, $document);

        return response()->json([
            'message' => 'Document supprimé définitivement.'
        ]);
    }

    public function empty(Request $request)
    {
        $this->guard($request, 'supprimer_definitivement_corbeille');

        // Le bibliothécaire ne vide que la corbeille de sa bibliothèque.
        $me = $request->user();
        $users = $me->restrictToManagedLibrary(User::onlyTrashed())->where('role', '!=', 'administrateur');
        $documents = $me->restrictToManagedLibrary(Document::onlyTrashed());
        $counts = ['utilisateurs' => (clone $users)->count(), 'documents' => (clone $documents)->count()];

        AccountRequest::deleteForDeletedAccounts((clone $users)->pluck('id')->all());
        $users->forceDelete();

        // Un par un (et non en une requête) pour déclencher forceDeleted : suppression des PDF et couvertures.
        $documents->each(fn (Document $document) => $document->forceDelete());

        // Une seule entrée récapitulative : les éléments supprimés ne sont plus consultables individuellement.
        ActivityLogService::log(
            $request->user()->id,
            'vidage_corbeille',
            "{$counts['utilisateurs']} compte(s) et {$counts['documents']} document(s) supprimés définitivement",
            null,
            ['utilisateurs' => ['before' => $counts['utilisateurs'], 'after' => 0], 'documents' => ['before' => $counts['documents'], 'after' => 0]],
        );

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

        $content = [
            'heading' => 'Votre compte a été restauré',
            'paragraphs' => [
                "Bonjour {$user->name},",
                'Votre compte de la Bibliothèque Numérique a été restauré par l’administrateur.',
                'Pour des raisons de sécurité, vous devez créer un nouveau mot de passe avant de pouvoir utiliser votre compte.',
            ],
            'details' => [
                'Numéro de compte' => $matricule,
                'Référence de la demande' => $accountRequest->request_number,
            ],
            'buttonLabel' => 'Créer mon mot de passe',
            'buttonUrl' => $url,
            'note' => 'Ce lien est valable pendant ' . AccountRequest::SETUP_LINK_HOURS . ' heures et ne peut être utilisé qu’une seule fois.',
            'footerNote' => 'Conservez précieusement votre numéro de compte : il pourra vous être demandé en cas de perte de vos informations.',
        ];

        try {
            Mail::send(
                'emails.notice',
                $content,
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
