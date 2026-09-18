<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('permissions', function (Blueprint $table) {
            $table->string('category')->default('general')->after('name');
        });

        $now = now();
        $permissions = [
            ['name' => 'voir_documents', 'category' => 'documents', 'label' => 'Voir les documents', 'description' => 'Consulter les documents dans l’espace de gestion.'],
            ['name' => 'ajouter_document', 'category' => 'documents', 'label' => 'Ajouter des documents', 'description' => 'Créer de nouveaux documents.'],
            ['name' => 'modifier_document', 'category' => 'documents', 'label' => 'Modifier les documents', 'description' => 'Modifier ou archiver des documents.'],
            ['name' => 'publier_document', 'category' => 'documents', 'label' => 'Publier des documents', 'description' => 'Publier des documents.'],
            ['name' => 'supprimer_document', 'category' => 'documents', 'label' => 'Supprimer les documents', 'description' => 'Supprimer des documents.'],
            ['name' => 'voir_liste_membres', 'category' => 'membres', 'label' => 'Voir les membres', 'description' => 'Consulter la liste des membres.'],
            ['name' => 'importer_membres', 'category' => 'membres', 'label' => 'Importer les membres', 'description' => 'Importer un registre de membres.'],
            ['name' => 'exporter_membres', 'category' => 'membres', 'label' => 'Exporter les membres', 'description' => 'Exporter le registre des membres.'],
            ['name' => 'voir_corbeille', 'category' => 'corbeille', 'label' => 'Voir la corbeille', 'description' => 'Consulter les éléments supprimés.'],
            ['name' => 'restaurer_corbeille', 'category' => 'corbeille', 'label' => 'Restaurer depuis la corbeille', 'description' => 'Restaurer les éléments supprimés.'],
            ['name' => 'supprimer_definitivement_corbeille', 'category' => 'corbeille', 'label' => 'Supprimer définitivement', 'description' => 'Supprimer définitivement les éléments de la corbeille.'],
            ['name' => 'voir_mes_activites', 'category' => 'activites', 'label' => 'Voir mes activités', 'description' => 'Consulter son historique d’activité.'],
            ['name' => 'voir_activites_autres', 'category' => 'activites', 'label' => 'Voir les activités des autres', 'description' => 'Consulter l’historique global.'],
            ['name' => 'voir_notifications', 'category' => 'notifications', 'label' => 'Voir les notifications', 'description' => 'Consulter ses notifications.'],
            ['name' => 'gerer_notifications', 'category' => 'notifications', 'label' => 'Gérer les notifications', 'description' => 'Marquer les notifications comme lues ou non lues.'],
            ['name' => 'voir_bibliotheques', 'category' => 'bibliotheques', 'label' => 'Voir les bibliothèques', 'description' => 'Consulter les bibliothèques.'],
            ['name' => 'modifier_bibliotheque', 'category' => 'bibliotheques', 'label' => 'Modifier les bibliothèques', 'description' => 'Modifier les bibliothèques.'],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                [...$permission, 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        DB::table('permissions')->whereIn('name', [
            'voir_documents', 'restaurer_corbeille', 'supprimer_definitivement_corbeille',
            'voir_mes_activites', 'voir_activites_autres', 'voir_notifications',
            'gerer_notifications', 'voir_bibliotheques', 'modifier_bibliotheque',
        ])->delete();

        Schema::table('permissions', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
