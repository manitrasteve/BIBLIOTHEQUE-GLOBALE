<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MemberRegistry;
use App\Models\User;
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
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'max:50'],
            'address' => ['required', 'string', 'max:255'],
            'library_id' => ['required', 'integer', 'exists:libraries,id'],
            'gender' => ['required', 'in:masculin,feminin'],
            'cin_number' => ['required', 'digits:12'],
            'cin_issued_at' => ['required', 'date'],
        ]);

        $user = User::create([
            'name' => trim($data['first_name'] . ' ' . $data['last_name']),
            'email' => mb_strtolower(trim($data['email'])),
            'password' => Hash::make(Str::random(64)),
            'password_set_at' => null,
            'role' => 'bibliothecaire',
            'address' => $data['address'],
            'phone' => $data['phone'],
            'gender' => $data['gender'],
            'library_id' => $data['library_id'],
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
            'first_name' => $data['first_name'],
            'email' => $user->email,
            'phone' => $user->phone,
            'address' => $user->address,
            'gender' => $user->gender,
            'library_id' => $data['library_id'],
            'status' => 'desactive',
            'profile_data' => [],
        ]);

        $token = Str::random(64);
        \Illuminate\Support\Facades\DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => Hash::make($token), 'created_at' => now()]
        );
        $url = rtrim(config('app.url'), '/') . '/reinitialiser-mot-de-passe?token=' . urlencode($token) . '&email=' . urlencode($user->email);

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
            'note' => 'Ce lien est valable pendant 60 minutes et ne peut être utilisé qu’une seule fois.',
            'footerNote' => 'Conservez précieusement votre numéro de compte.',
        ];

        try {
            Mail::send('emails.notice', $content, fn ($message) => $message
                ->to($user->email)
                ->subject('Votre compte Bibliothèque a été créé par l’administrateur'));
        } catch (\Throwable $e) {
            report($e);
        }

        ActivityLogService::log($request->user()->id, 'creation_bibliothecaire', $user->name, $user);

        return response()->json([
            'user' => $user->fresh(),
            'message' => 'Bibliothécaire créé et e-mail envoyé.',
        ], 201);
    }
}
