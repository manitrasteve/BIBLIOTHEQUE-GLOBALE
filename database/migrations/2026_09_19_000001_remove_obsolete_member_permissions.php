<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * L'ancienne gestion séparée des membres ("Listes des membres") n'existe plus :
 * ses trois permissions (catégorie "membres") ne sont plus utilisées par aucune
 * route ni aucun écran. Le registre `member_registries` est conservé : il garantit
 * toujours l'unicité et la non-réutilisation des numéros de compte.
 */
return new class extends Migration
{
    private const NAMES = ['voir_liste_membres', 'importer_membres', 'exporter_membres'];

    public function up(): void
    {
        $ids = DB::table('permissions')->whereIn('name', self::NAMES)->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }

    public function down(): void
    {
        $now = now();

        foreach ([
            ['name' => 'voir_liste_membres', 'label' => 'Voir les membres', 'description' => 'Consulter la liste des membres.'],
            ['name' => 'importer_membres', 'label' => 'Importer les membres', 'description' => 'Importer un registre de membres.'],
            ['name' => 'exporter_membres', 'label' => 'Exporter les membres', 'description' => 'Exporter le registre des membres.'],
        ] as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                [...$permission, 'category' => 'membres', 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }
};
