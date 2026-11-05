<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Permission exigée par la route de validation des demandes de compte (permission:valider_demande_compte)
 * mais jamais créée : aucun bibliothécaire ne pouvait donc la recevoir, et seuls les administrateurs
 * validaient. Elle devient attribuable ; aucun bibliothécaire ne la reçoit automatiquement.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('permissions')->updateOrInsert(
            ['name' => 'valider_demande_compte'],
            [
                'category' => 'utilisateurs',
                'label' => 'Valider les demandes de compte',
                'description' => 'Valider une demande de compte déjà vérifiée : le compte est créé et le lien de création du mot de passe est envoyé.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->where('name', 'valider_demande_compte')->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }
};
