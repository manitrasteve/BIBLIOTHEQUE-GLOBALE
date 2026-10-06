<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TeacherClass;
use App\Models\TeacherClassRequest;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use App\Support\AccountRequestRules as Rules;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Demandes de classe : l'enseignant demande à enseigner dans une classe (établissement + niveau) ;
 * le Service Numérique et l'administrateur sont notifiés et valident (classe attribuée) ou refusent.
 */
class TeacherClassRequestController extends Controller
{
    // ---------------------------------------------------------------- Enseignant

    /** Mes classes attribuées et mes demandes, avec les listes de choix. */
    public function mine(Request $request)
    {
        $teacher = $request->user();

        return response()->json([
            'classes' => $teacher->teacherClasses()->get(['id', 'school', 'level', 'created_at']),
            'requests' => TeacherClassRequest::where('user_id', $teacher->id)->latest()->get(['id', 'school', 'level', 'message', 'status', 'reason', 'processed_at', 'created_at']),
            'schools' => Rules::SCHOOLS,
            'levels' => Rules::LEVELS,
        ]);
    }

    public function store(Request $request)
    {
        $teacher = $request->user();
        $data = $request->validate([
            'school' => ['required', Rule::in(Rules::SCHOOLS)],
            'level' => ['required', Rule::in(Rules::LEVELS)],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        abort_if($teacher->teachesClass($data['school'], $data['level']), 422, 'Cette classe vous est déjà attribuée.');
        abort_if(
            TeacherClassRequest::where('user_id', $teacher->id)->where('school', $data['school'])->where('level', $data['level'])->where('status', 'en_attente')->exists(),
            422,
            'Une demande pour cette classe est déjà en attente.',
        );

        $classRequest = TeacherClassRequest::create([...$data, 'user_id' => $teacher->id]);

        User::whereIn('role', ['administrateur', 'bibliothecaire'])->where('is_active', true)->each(
            fn (User $staff) => NotificationService::send(
                $staff,
                'classe_demandee',
                'Demande de classe d’un enseignant',
                "{$teacher->name} demande à enseigner en {$data['school']} · {$data['level']}.",
                $classRequest,
            )
        );
        ActivityLogService::log($teacher->id, 'demande_classe_enseignant', "{$data['school']} · {$data['level']}", $classRequest);

        return response()->json($classRequest, 201);
    }

    /** Annulation d'une demande encore en attente. */
    public function destroy(Request $request, TeacherClassRequest $classRequest)
    {
        abort_unless((int) $classRequest->user_id === (int) $request->user()->id, 403);
        abort_unless($classRequest->status === 'en_attente', 422, 'Cette demande a déjà été traitée.');
        $classRequest->delete();

        return response()->json(['message' => 'Demande annulée.']);
    }

    // ---------------------------------------------------------------- Service Numérique / administrateur

    /** Demandes en attente (les plus anciennes d'abord). */
    public function pending()
    {
        return response()->json(
            // Profil de l'enseignant et ses classes actuelles : affichés dans la fiche « Voir » de la demande.
            TeacherClassRequest::where('status', 'en_attente')
                ->with([
                    'user:id,name,email,role,is_active,password_set_at,phone,matricule,faculty,department,position,teaching_specialty,photo_path,created_at',
                    'user.teacherClasses:id,user_id,school,level',
                ])
                ->oldest()
                ->get()
        );
    }

    public function approve(Request $request, TeacherClassRequest $classRequest)
    {
        $this->ensurePending($classRequest);
        $teacher = $classRequest->user;
        abort_unless($teacher && $teacher->role === 'enseignant', 422, 'Ce compte n’est plus un compte enseignant.');

        TeacherClass::firstOrCreate(['user_id' => $teacher->id, 'school' => $classRequest->school, 'level' => $classRequest->level]);
        $classRequest->update(['status' => 'acceptee', 'processed_by' => $request->user()->id, 'processed_at' => now()]);

        NotificationService::send($teacher, 'classe_acceptee', 'Classe attribuée', "Vous enseignez désormais en {$classRequest->school} · {$classRequest->level}. Vous pouvez lui adresser des bibliographies de cours.", $classRequest);
        ActivityLogService::log($request->user()->id, 'classes_enseignant_modifiees', $teacher->name, $teacher, [
            'classes' => ['before' => null, 'after' => "{$classRequest->school} · {$classRequest->level} (demande acceptée)"],
        ]);

        return response()->json($classRequest->fresh());
    }

    public function reject(Request $request, TeacherClassRequest $classRequest)
    {
        $this->ensurePending($classRequest);
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        $classRequest->update(['status' => 'refusee', 'reason' => $data['reason'], 'processed_by' => $request->user()->id, 'processed_at' => now()]);

        if ($teacher = $classRequest->user) {
            NotificationService::send($teacher, 'classe_refusee', 'Demande de classe refusée', "{$classRequest->school} · {$classRequest->level} : {$data['reason']}", $classRequest);
        }
        ActivityLogService::log($request->user()->id, 'refus_demande_classe', $teacher?->name, $classRequest);

        return response()->json($classRequest->fresh());
    }

    private function ensurePending(TeacherClassRequest $classRequest): void
    {
        abort_unless($classRequest->status === 'en_attente', 422, 'Cette demande a déjà été traitée.');
    }
}
