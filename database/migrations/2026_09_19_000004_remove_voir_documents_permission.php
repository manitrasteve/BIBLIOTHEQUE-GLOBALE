<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * L'accès de base au module Document appartient désormais au rôle Bibliothécaire :
 * la permission `voir_documents` n'est plus configurable. Les permissions d'action
 * (ajouter, modifier, publier, supprimer) restent inchangées.
 */
return new class extends Migration
{
    public function up(): void
    {
        $ids = DB::table('permissions')->where('name', 'voir_documents')->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }

    public function down(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['name' => 'voir_documents'],
            [
                'category' => 'documents',
                'label' => 'Voir les documents',
                'description' => 'Consulter les documents dans l’espace de gestion.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }
};
