<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ajouter un document fait partie du rôle Bibliothécaire : la permission
 * `ajouter_document` n'est plus configurable. Modifier, publier et supprimer
 * restent des permissions distinctes.
 */
return new class extends Migration
{
    public function up(): void
    {
        $ids = DB::table('permissions')->where('name', 'ajouter_document')->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }

    public function down(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['name' => 'ajouter_document'],
            [
                'category' => 'documents',
                'label' => 'Ajouter des documents',
                'description' => 'Créer de nouveaux documents.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }
};
