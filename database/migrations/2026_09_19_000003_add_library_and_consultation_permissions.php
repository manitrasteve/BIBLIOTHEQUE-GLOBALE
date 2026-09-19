<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Nouvelles permissions individuelles pour les bibliothécaires :
 *  - ajouter_bibliotheque : créer une bibliothèque ;
 *  - voir_popularite, voir_avis_utilisateurs, voir_signalements, voir_statistiques :
 *    droits de CONSULTATION indépendants (ni réponse, ni suppression, ni traitement).
 * Aucun bibliothécaire ne les reçoit automatiquement.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        ['name' => 'ajouter_bibliotheque', 'category' => 'bibliotheques', 'label' => 'Ajouter une bibliothèque', 'description' => 'Créer une nouvelle bibliothèque (sans pouvoir modifier ni supprimer les bibliothèques existantes).'],
        ['name' => 'voir_popularite', 'category' => 'consultation', 'label' => 'Voir la popularité', 'description' => 'Consulter la popularité des documents (lecture seule).'],
        ['name' => 'voir_avis_utilisateurs', 'category' => 'consultation', 'label' => 'Voir les avis des utilisateurs', 'description' => 'Consulter les avis des utilisateurs (sans répondre ni supprimer).'],
        ['name' => 'voir_signalements', 'category' => 'consultation', 'label' => 'Voir les signalements', 'description' => 'Consulter les signalements (sans les traiter ni les supprimer).'],
        ['name' => 'voir_statistiques', 'category' => 'consultation', 'label' => 'Voir les statistiques', 'description' => 'Consulter les statistiques de la plateforme (lecture seule).'],
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::PERMISSIONS as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                [...$permission, 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->whereIn('name', array_column(self::PERMISSIONS, 'name'))->pluck('id');

        if ($ids->isNotEmpty()) {
            DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
            DB::table('permissions')->whereIn('id', $ids)->delete();
        }
    }
};
