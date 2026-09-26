<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\MemberRegistry;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

// Nouveau contrôleur (n'existait pas dans les phases précédentes).
// Réservé à l'administrateur — voir routes.api.snippet.php pour l'enregistrement.
class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::with('library:id,name')->whereIn('role', ['etudiant','enseignant','chercheur'])->orderByDesc('created_at');

        // Compteurs : mêmes comptes que la liste (étudiants, enseignants, chercheurs ; corbeille exclue) et même
        // recherche, mais sans les filtres de rôle / d'état, pour que chaque compteur garde son propre nombre.
        $counted = clone $query;
        if ($search = $request->get('search')) {
            $counted->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")->orWhere('matricule', 'like', "%{$search}%");
            });
        }
        $counts = $this->userCounts($counted);

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->get('is_active'), FILTER_VALIDATE_BOOLEAN));
        }
        if ($role = $request->get('role')) {
            $query->where('role', $role);
        }
        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")->orWhere('matricule', 'like', "%{$search}%");
            });
        }

        return response()->json([...$query->paginate(20)->toArray(), 'counts' => $counts]);
    }

    private function userCounts($scoped): array
    {
        $byRole = $scoped->reorder()->toBase()->selectRaw('role, COUNT(*) AS total')->groupBy('role')->pluck('total', 'role');
        $active = (clone $scoped)->reorder()->where('is_active', true)->count();
        $total = (int) $byRole->sum();

        // Comptes gérés sur leurs propres pages : affichés à titre indicatif, hors du total de cette liste.
        $others = User::query()->whereIn('role', ['bibliothecaire', 'administrateur'])->selectRaw('role, COUNT(*) AS total')->groupBy('role')->pluck('total', 'role');

        return [
            'total' => $total,
            'etudiant' => (int) ($byRole['etudiant'] ?? 0),
            'enseignant' => (int) ($byRole['enseignant'] ?? 0),
            'chercheur' => (int) ($byRole['chercheur'] ?? 0),
            'actifs' => $active,
            'inactifs' => $total - $active,
            'hors_total' => [
                'bibliothecaire' => (int) ($others['bibliothecaire'] ?? 0),
                'administrateur' => (int) ($others['administrateur'] ?? 0),
            ],
        ];
    }

    public function reactivate(Request $request, User $user)
    {
        $user->update(['is_active' => false, 'password_set_at' => null]);
        $user->tokens()->delete(); // l'utilisateur doit se reconnecter avec son nouveau mot de passe
        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['status' => 'desactive']);
        }

        $token = Str::random(64);
        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => \Illuminate\Support\Facades\Hash::make($token), 'created_at' => now()]
        );
        $url = rtrim(config('app.url'), '/').'/reinitialiser-mot-de-passe?token='.urlencode($token).'&email='.urlencode($user->email).'&type=creation'; // même page que la réinitialisation, avec le vocabulaire « créer »

        ActivityLogService::log($request->user()->id, 'reactivation_compte', $user->name, $user);

        $this->sendMail(
            $user->email,
            'Votre compte a été réactivé',
            [
                'heading' => 'Votre compte a été réactivé',
                'paragraphs' => [
                    "Bonjour {$user->name},",
                    'Votre compte a été réactivé.',
                    'Vous pouvez maintenant créer votre mot de passe.',
                ],
                'buttonLabel' => 'Créer mon mot de passe',
                'buttonUrl' => $url,
                'note' => 'Ce lien est valable pendant 60 minutes.',
            ]
        );

        return response()->json($user);
    }

    public function deactivate(Request $request, User $user)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        abort_if($user->id === $request->user()->id, 422, 'Vous ne pouvez pas désactiver votre propre compte.');

        $user->update(['is_active' => false]);
        // Sans cela, un compte désactivé resterait connecté (favoris, messages, profil…) jusqu'à sa déconnexion.
        $user->tokens()->delete();
        // Un lien de réinitialisation encore valide ne doit pas survivre à la désactivation.
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();
        // Idem pour le lien de création du mot de passe : il réactiverait le compte (setupPassword).
        \App\Models\AccountRequest::where('created_user_id', $user->id)
            ->whereNotNull('setup_token_hash')
            ->update(['setup_token_hash' => null, 'setup_expires_at' => null]);
        \App\Services\NotificationService::send($user, 'compte_desactive', 'Compte désactivé', "Votre compte a été désactivé. Raison : {$data['reason']}", $user);

        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['status' => 'desactive']);
        }

        ActivityLogService::log($request->user()->id, 'desactivation_compte', "{$user->name} — Raison : {$data['reason']}", $user);

        $this->sendMail(
            $user->email,
            'Votre compte a été désactivé',
            [
                'heading' => 'Votre compte a été désactivé',
                'paragraphs' => [
                    "Bonjour {$user->name},",
                    'Votre compte a été désactivé par l’administrateur.',
                    "Motif : {$data['reason']}",
                ],
            ]
        );

        return response()->json($user);
    }

    // Suppression définitive. Protégée : on ne peut pas se supprimer
    // soi-même, ni supprimer le dernier administrateur, et un utilisateur
        public function destroy(Request $request, User $user)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        abort_if($user->id === $request->user()->id, 422, 'Vous ne pouvez pas supprimer votre propre compte.');

        // La suppression totale n'est autorisée que pour les comptes
        // utilisateur classiques (étudiant, enseignant, chercheur).
                if (in_array($user->role, ['administrateur','bibliothecaire'], true)) {
            abort(422, "Un compte {$user->role} ne peut pas être supprimé, seulement désactivé.");
        }

        $name = $user->name;
        $email = $user->email;

        ActivityLogService::log($request->user()->id, 'suppression_utilisateur', "{$name} — Raison : {$data['reason']}", $user);

        $this->sendMail(
            $email,
            'Votre compte a été supprimé',
            [
                'heading' => 'Votre compte a été supprimé',
                'paragraphs' => [
                    "Bonjour {$name},",
                    'Votre compte de la Bibliothèque Numérique a été supprimé par l’administrateur.',
                    "Motif : {$data['reason']}",
                ],
            ]
        );

        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['user_id' => null, 'status' => 'supprime']);
        }

        \App\Services\NotificationService::send($user, 'compte_supprime', 'Compte supprimé', "Votre compte a été supprimé. Raison : {$data['reason']}", $user);
        // Les jetons survivent au soft delete : ils redeviendraient valides après une restauration.
        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Utilisateur supprimé. Son numéro de compte reste conservé dans l’historique et ne sera jamais réattribué.']);
    }
    private function sendMail(string $email, string $subject, array $content): void
    {
        try {
            Mail::send('emails.notice', $content, fn ($message) => $message->to($email)->subject($subject));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
