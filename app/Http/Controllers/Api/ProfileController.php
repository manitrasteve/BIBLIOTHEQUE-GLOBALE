<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Rules\AvailableEmail;
use App\Support\AccountRequestRules as Rules;
use Illuminate\Validation\Rule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json($request->user()->load('library'));
    }

    public function update(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'email' => ['required','email','max:255', new AvailableEmail($user->id)],
            'phone' => ['nullable','string','max:50'],
            'address' => ['nullable','string','max:255'],
            'date_of_birth' => ['nullable','date'],
            'photo' => ['nullable','image','mimes:jpg,jpeg,png,webp','max:2048'],
            'school' => ['nullable','string','max:255'], 'filiere'=>['nullable','string','max:255'],
            'niveau_type'=>['nullable','string','max:50', ...$this->listRuleIfChanged($request, 'niveau_type', Rules::NIVEAU_TYPES)],
            'niveau_detail'=>['nullable','string','max:80', ...$this->listRuleIfChanged($request, 'niveau_detail', Rules::LEVELS)],
            'faculty'=>['nullable','string','max:255'], 'department'=>['nullable','string','max:255'],
            'position'=>['nullable','string','max:255'], 'teaching_specialty'=>['nullable','string','max:255'],
            'specialty'=>['nullable','string','max:255'], 'diploma'=>['nullable','string','max:255'],
            'workplace'=>['nullable','string','max:255'], 'researcher_field'=>['nullable','string','max:255'],
            'research_lab'=>['nullable','string','max:255'],
            'profession'=>['nullable','string','max:255'], 'experience'=>['nullable','string','max:2000'],
        ]);

        // Changer l'adresse e-mail, c'est changer l'adresse qui reçoit les liens de mot de passe : sans
        // ce contrôle, un jeton volé ou une session restée ouverte suffisait à prendre le compte.
        $emailChanged = strcasecmp($data['email'], (string) $user->email) !== 0;
        if ($emailChanged) {
            $request->validate(
                ['current_password' => ['required', 'string']],
                ['current_password.required' => 'Saisissez votre mot de passe actuel pour changer d’adresse e-mail.']
            );
            if (!\Illuminate\Support\Facades\Hash::check($request->input('current_password'), $user->password)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'current_password' => 'Le mot de passe actuel est incorrect.',
                ]);
            }
        }

        // Le centre d'un enseignant est rattaché à son compte : il ne peut pas en sortir par son profil
        // (il atteindrait les étudiants d'un autre centre, ses bibliographies restant à l'ancien).
        if (
            $user->role === 'enseignant'
            && filled($user->school)
            && array_key_exists('school', $data)
            && $data['school'] !== $user->school
        ) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'school' => 'Votre établissement est rattaché à votre compte : il ne peut pas être modifié depuis votre profil.',
            ]);
        }

        unset($data['photo']);
        if ($request->hasFile('photo')) {
            if ($user->photo_path) Storage::disk('public')->delete($user->photo_path);
            $data['photo_path'] = $request->file('photo')->store('profiles','public');
        }

        // Enseignant sans centre (ancien compte) qui renseigne le sien : ses classes le reprennent,
        // pour que le ciblage des bibliographies reste cohérent.
        $schoolChanged = $user->role === 'enseignant'
            && array_key_exists('school', $data)
            && filled($data['school'])
            && $data['school'] !== $user->school;

        $oldEmail = $user->email;
        $user->update($data);

        if ($emailChanged) {
            // Un lien de réinitialisation envoyé à l'ancienne adresse ne doit plus servir.
            \Illuminate\Support\Facades\DB::table('password_reset_tokens')->where('email', $oldEmail)->delete();
        }

        if ($schoolChanged) {
            \App\Models\TeacherClass::where('user_id', $user->id)->update(['school' => $data['school']]);
        }

        return response()->json($user->fresh()->load('library'));
    }

    // Mêmes listes qu'à la création du compte, mais seulement si la valeur change : un profil existant
    // en texte libre reste enregistrable tant qu'on n'y touche pas.
    private function listRuleIfChanged(Request $request, string $field, array $allowed): array
    {
        return $request->input($field) !== $request->user()->{$field} ? [Rule::in($allowed)] : [];
    }

    // Profil lecteur : chiffres de lecture et catégories les plus consultées (données réelles uniquement).
    public function readingStats(Request $request)
    {
        $user = $request->user();

        $topCategories = \App\Models\Consultation::query()
            ->where('consultations.user_id', $user->id)
            ->join('documents', 'documents.id', '=', 'consultations.document_id')
            ->whereNull('documents.deleted_at')
            ->join('categories', 'categories.id', '=', 'documents.category_id')
            ->selectRaw('categories.name AS name, COUNT(DISTINCT consultations.document_id) AS documents')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('documents')
            ->orderBy('categories.name')
            ->limit(5)
            ->get()
            ->map(fn ($row) => ['name' => $row->name, 'documents' => (int) $row->documents]);

        // Documents distincts et total des consultations en une seule requête.
        $consulted = $user->consultations()->toBase()
            ->whereIn('document_id', fn ($q) => $q->select('id')->from('documents')->whereNull('deleted_at'))
            ->selectRaw('COUNT(DISTINCT document_id) as documents, COUNT(*) as total')
            ->first();

        return response()->json([
            'documents_read' => (int) ($consulted->documents ?? 0),
            'consultations' => (int) ($consulted->total ?? 0),
            'pages_reached' => (int) \App\Models\ReadingProgress::where('user_id', $user->id)->sum('last_page'),
            'notes' => \App\Models\DocumentNote::where('user_id', $user->id)->count(),
            'favorites' => $user->favorites()->count(),
            'ai_queries' => $user->aiQueries()->count(),
            'top_categories' => $topCategories,
            'member_since' => $user->created_at,
        ]);
    }

    // Préférences d'affichage (robot assistant flottant).
    public function updatePreferences(Request $request)
    {
        $data = $request->validate([
            'show_ai_robot' => ['sometimes', 'boolean'],
            'ai_robot_position' => ['sometimes', 'in:left,right'],
        ]);

        $request->user()->update($data);

        return response()->json($request->user()->only(['show_ai_robot', 'ai_robot_position']));
    }

    public function deletePhoto(Request $request)
    {
        $user = $request->user();
        if ($user->photo_path) Storage::disk('public')->delete($user->photo_path);
        $user->update(['photo_path'=>null]);
        return response()->json($user->fresh());
    }
}
