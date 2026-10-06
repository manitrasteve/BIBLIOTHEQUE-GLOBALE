<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TeacherClass;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Support\AccountRequestRules as Rules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Service Numérique / administrateur : classes (établissement + niveau) attribuées à chaque enseignant.
 * Un enseignant ne peut adresser une bibliographie de cours qu'à ces classes.
 */
class TeacherClassController extends Controller
{
    public function index(Request $request)
    {
        $teachers = User::query()
            ->where('role', 'enseignant')
            ->with('teacherClasses:id,user_id,school,level')
            ->when($request->get('search'), function ($q, $search) {
                $q->where(fn ($w) => $w->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('faculty', 'like', "%{$search}%")
                    ->orWhere('teaching_specialty', 'like', "%{$search}%"));
            })
            ->orderBy('name')
            ->paginate(20, ['id', 'name', 'email', 'faculty', 'department', 'teaching_specialty', 'is_active']);

        return response()->json([
            ...$teachers->toArray(),
            'schools' => Rules::SCHOOLS,
            'levels' => Rules::LEVELS,
        ]);
    }

    /** Remplace la liste des classes de l'enseignant (cases cochées). */
    public function update(Request $request, User $user)
    {
        abort_unless($user->role === 'enseignant', 404);

        $data = $request->validate([
            'classes' => ['present', 'array', 'max:60'],
            'classes.*.school' => ['required', Rule::in(Rules::SCHOOLS)],
            'classes.*.level' => ['required', Rule::in(Rules::LEVELS)],
        ]);

        $wanted = collect($data['classes'])
            ->map(fn ($c) => ['school' => $c['school'], 'level' => $c['level']])
            ->unique(fn ($c) => $c['school'] . '|' . $c['level'])
            ->values();
        $before = $user->teacherClasses->map(fn ($c) => "{$c->school} · {$c->level}")->sort()->values()->all();

        DB::transaction(function () use ($user, $wanted) {
            $user->teacherClasses()->delete();
            foreach ($wanted as $class) {
                TeacherClass::create(['user_id' => $user->id, ...$class]);
            }
        });

        $after = $wanted->map(fn ($c) => "{$c['school']} · {$c['level']}")->sort()->values()->all();
        if ($before !== $after) {
            ActivityLogService::log(
                $request->user()->id,
                'classes_enseignant_modifiees',
                $user->name,
                $user,
                ['classes' => ['before' => $before ?: null, 'after' => $after ?: null]],
            );
        }

        return response()->json($user->teacherClasses()->get(['id', 'school', 'level']));
    }
}
