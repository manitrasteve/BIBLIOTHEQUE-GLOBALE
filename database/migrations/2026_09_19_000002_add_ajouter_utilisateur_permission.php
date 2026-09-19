<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Nouvelle permission attribuable aux bibliothécaires : elle contrôle l'accès au
 * formulaire d'ajout d'un utilisateur (demande de compte étudiant transmise à
 * l'administrateur). Aucun bibliothécaire ne la reçoit automatiquement.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('permissions')->updateOrInsert(
            ['name' => 'ajouter_utilisateur'],
            [
                'category' => 'utilisateurs',
                'label' => 'Ajouter un utilisateur',
                'description' => 'Ajouter un nouvel utilisateur (étudiant) via une demande de compte transmise à l’administrateur.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->where('name', 'ajouter_utilisateur')->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }
};
