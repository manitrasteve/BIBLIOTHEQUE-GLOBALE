<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Modifier et archiver un document font partie du rôle Bibliothécaire : la
 * permission `modifier_document` n'est plus configurable. Publier et supprimer
 * restent des permissions distinctes.
 */
return new class extends Migration
{
    public function up(): void
    {
        $ids = DB::table('permissions')->where('name', 'modifier_document')->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }

    public function down(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['name' => 'modifier_document'],
            [
                'category' => 'documents',
                'label' => 'Modifier les documents',
                'description' => 'Modifier ou archiver des documents.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }
};
