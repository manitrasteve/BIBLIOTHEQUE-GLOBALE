<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Models\MemberRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Identifiants incorrects.'],
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => [
                    "Votre compte n'est pas encore actif. Vérifiez votre e-mail ou attendez sa validation.",
                ],
            ]);
        }

        $token = $user->createToken('api')->plainTextToken;

        ActivityLogService::log(
            $user->id,
            'connexion',
            'Connexion à la plateforme',
        );

        return response()->json([
            'user' => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Déconnecté.',
        ]);
    }

    public function me(Request $request)
    {
        return response()->json($this->userPayload($request->user()));
    }

    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (!Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Ancien mot de passe incorrect.'],
            ]);
        }

        $request->user()->update([
            'password' => Hash::make($data['password']),
        ]);

        return response()->json([
            'message' => 'Mot de passe modifié avec succès.',
        ]);
    }

    private function userPayload(User $user): array
    {
        $payload = $user->load('library')->toArray();
        $payload['permissions'] = $user->permissions()->pluck('name')->values();

        return $payload;
    }

    public function forgotPassword(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = mb_strtolower(trim($data['email']));

        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        /*
         * Toujours retourner le même message afin de ne pas révéler si
         * une adresse e-mail possède un compte.
         */
        if ($user && $user->is_active) {
            $token = Str::random(64);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                [
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ],
            );

            $url = rtrim(config('app.url'), '/') .
                '/reinitialiser-mot-de-passe?token=' .
                urlencode($token) .
                '&email=' .
                urlencode($user->email);

            try {
                Mail::send(
                    'emails.notice',
                    [
                        'heading' => 'Réinitialisation de votre mot de passe',
                        'paragraphs' => [
                            "Bonjour {$user->name},",
                            'Vous avez demandé à réinitialiser votre mot de passe.',
                        ],
                        'buttonLabel' => 'Réinitialiser mon mot de passe',
                        'buttonUrl' => $url,
                        'note' => 'Ce lien est valable pendant 60 minutes.',
                        'footerNote' => "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.",
                    ],
                    fn ($message) => $message
                        ->to($user->email)
                        ->subject('Réinitialisation de votre mot de passe'),
                );
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return response()->json([
            'message' => 'Si cette adresse existe, un lien de réinitialisation a été envoyé.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $email = mb_strtolower(trim($data['email']));

        $row = DB::table('password_reset_tokens')
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        if (!$row) {
            throw ValidationException::withMessages([
                'token' => ['Lien invalide ou expiré.'],
            ]);
        }

        $createdAt = $row->created_at
            ? \Illuminate\Support\Carbon::parse($row->created_at)
            : null;

        $valid =
            $createdAt &&
            $createdAt->gt(now()->subMinutes(60)) &&
            Hash::check($data['token'], $row->token);

        if (!$valid) {
            throw ValidationException::withMessages([
                'token' => ['Lien invalide ou expiré.'],
            ]);
        }

        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if (!$user) {
            throw ValidationException::withMessages([
                'token' => ['Lien invalide ou expiré.'],
            ]);
        }

        $user->update([
            'password' => Hash::make($data['password']),
            'password_set_at' => now(),
            'is_active' => true,
            'email_verified_at' => $user->email_verified_at ?: now(),
        ]);
        if ($registry = MemberRegistry::where('user_id', $user->id)->first()) {
            $registry->update(['status' => 'actif']);
        }

        // Le token est à usage unique.
        DB::table('password_reset_tokens')
            ->where('email', $row->email)
            ->delete();

        return response()->json([
            'message' => 'Votre mot de passe a été réinitialisé avec succès.',
        ]);
    }
}
