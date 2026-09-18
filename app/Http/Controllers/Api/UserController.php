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

        return response()->json($query->paginate(20));
    }

    public function reactivate(Request $request, User $user)
    {
        $user->update(['is_active' => false, 'password_set_at' => null]);
        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['status' => 'desactive']);
        }

        $token = Str::random(64);
        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => \Illuminate\Support\Facades\Hash::make($token), 'created_at' => now()]
        );
        $url = rtrim(config('app.url'), '/').'/reinitialiser-mot-de-passe?token='.urlencode($token).'&email='.urlencode($user->email);

        ActivityLogService::log($request->user()->id, 'reactivation_compte', $user->name, $user);

        $this->sendMail(
            $user->email,
            'Votre compte a été réactivé',
            "Bonjour {$user->name},\n\nVotre compte a été réactivé.\nVeuillez créer votre mot de passe avec ce lien sécurisé (valable 60 minutes) :\n{$url}\n\nLa Bibliothèque Numérique de l'Université de Mahajanga"
        );

        return response()->json($user);
    }

    public function deactivate(Request $request, User $user)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        $user->update(['is_active' => false]);
        \App\Services\NotificationService::send($user, 'compte_desactive', 'Compte désactivé', "Votre compte a été désactivé. Raison : {$data['reason']}", $user);

        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['status' => 'desactive']);
        }

        ActivityLogService::log($request->user()->id, 'desactivation_compte', "{$user->name} — Raison : {$data['reason']}", $user);

        $this->sendMail(
            $user->email,
            'Votre compte a été désactivé',
            "Bonjour {$user->name},\n\nVotre compte a été désactivé.\nRaison : {$data['reason']}\n\nLa Bibliothèque Numérique de l'Université de Mahajanga"
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
            "Bonjour {$name},\n\nVotre compte a été supprimé par l'administrateur.\nRaison : {$data['reason']}\n\nLa Bibliothèque Numérique de l'Université de Mahajanga"
        );

        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['user_id' => null, 'status' => 'supprime']);
        }

        \App\Services\NotificationService::send($user, 'compte_supprime', 'Compte supprimé', "Votre compte a été supprimé. Raison : {$data['reason']}", $user);
        $user->delete();

        return response()->json(['message' => 'Utilisateur supprimé. Son matricule reste conservé dans l’historique des membres.']);
    }
    private function sendMail(string $email, string $subject, string $body): void
    {
        try {
            Mail::raw($body, fn ($message) => $message->to($email)->subject($subject));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
