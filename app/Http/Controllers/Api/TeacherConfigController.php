<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TeacherClass;
use App\Services\ActivityLogService;
use App\Support\AccountRequestRules as Rules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Paramètre de configuration de l'enseignant : il gère lui-même les classes (niveaux) qu'il assure,
 * mais uniquement à l'intérieur du centre (établissement) rattaché à son compte à la création.
 */
class TeacherConfigController extends Controller
{
    /** Centre de l'enseignant, niveaux possibles et niveaux déjà activés. */
    public function show(Request $request)
    {
        $teacher = $request->user();

        return response()->json([
            'centre' => $teacher->school,
            'levels' => Rules::LEVELS,
            'selected' => $teacher->teacherClasses()->pluck('level')->values(),
        ]);
    }

    /** Remplace la liste des niveaux de l'enseignant dans son centre. */
    public function update(Request $request)
    {
        $teacher = $request->user();
        abort_if(blank($teacher->school), 422, "Aucun centre n'est rattaché à votre compte. Contactez l'administration.");

        $data = $request->validate([
            'levels' => ['present', 'array', 'max:' . count(Rules::LEVELS)],
            'levels.*' => [Rule::in(Rules::LEVELS)],
        ]);

        $wanted = collect($data['levels'])->unique()->values();
        $before = $teacher->teacherClasses->pluck('level')->sort()->values()->all();

        DB::transaction(function () use ($teacher, $wanted) {
            $teacher->teacherClasses()->delete();
            foreach ($wanted as $level) {
                TeacherClass::create(['user_id' => $teacher->id, 'school' => $teacher->school, 'level' => $level]);
            }
        });

        $after = $wanted->sort()->values()->all();
        if ($before !== $after) {
            ActivityLogService::log(
                $teacher->id,
                'classes_enseignant_modifiees',
                $teacher->name,
                $teacher,
                ['classes' => ['before' => $before ?: null, 'after' => $after ?: null]],
            );
        }

        return response()->json([
            'centre' => $teacher->school,
            'levels' => Rules::LEVELS,
            'selected' => $teacher->teacherClasses()->pluck('level')->values(),
        ]);
    }
}
