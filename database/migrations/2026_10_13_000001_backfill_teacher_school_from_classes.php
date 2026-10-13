<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Reprise : l'enseignant possède désormais un centre (users.school) qu'il choisit à la création.
 * Pour les enseignants existants dont le centre est vide, on le déduit de l'établissement le plus
 * fréquent parmi ses classes déjà attribuées (teacher_classes).
 */
return new class extends Migration
{
    public function up(): void
    {
        $teachers = DB::table('users')
            ->where('role', 'enseignant')
            ->where(fn ($q) => $q->whereNull('school')->orWhere('school', ''))
            ->pluck('id');

        foreach ($teachers as $userId) {
            $school = DB::table('teacher_classes')
                ->where('user_id', $userId)
                ->select('school', DB::raw('COUNT(*) as total'))
                ->groupBy('school')
                ->orderByDesc('total')
                ->orderBy('school')
                ->value('school');

            if ($school) {
                DB::table('users')->where('id', $userId)->update(['school' => $school]);
            }
        }
    }

    public function down(): void
    {
        // Reprise de données non réversible : le centre déduit est conservé.
    }
};
