<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index des requêtes fréquentes (catalogue, tableaux de bord, badges du menu interrogés chaque minute,
 * notifications toutes les 20 s, statistiques, listes de gestion). Les clés étrangères ont déjà leur index
 * sous MySQL ; ceux-ci couvrent les filtres + tris (colonne de date) et les colonnes de statut.
 *
 * Idempotente : un index déjà présent (ajouté à la main en production) n'est pas recréé.
 */
return new class extends Migration
{
    /** table => [nom de l'index => colonnes] */
    private const INDEXES = [
        'documents' => [
            'documents_status_published_at_index' => ['status', 'published_at'],
        ],
        'consultations' => [
            'consultations_user_consulted_at_index' => ['user_id', 'consulted_at'],
            'consultations_consulted_at_index' => ['consulted_at'],
        ],
        'ai_queries' => [
            'ai_queries_user_created_at_index' => ['user_id', 'created_at'],
            'ai_queries_created_at_index' => ['created_at'],
        ],
        'favorites' => [
            'favorites_user_created_at_index' => ['user_id', 'created_at'],
        ],
        'app_notifications' => [
            'app_notifications_user_created_at_index' => ['user_id', 'created_at'],
        ],
        'activity_logs' => [
            'activity_logs_created_at_index' => ['created_at'],
            'activity_logs_action_created_at_index' => ['action', 'created_at'],
        ],
        'account_requests' => [
            'account_requests_status_created_at_index' => ['status', 'created_at'],
            'account_requests_created_at_index' => ['created_at'],
        ],
        'users' => [
            'users_role_is_active_index' => ['role', 'is_active'],
        ],
        'admin_message_recipients' => [
            'admin_message_recipients_user_read_at_index' => ['user_id', 'read_at'],
        ],
        'feedbacks' => [
            'feedbacks_status_index' => ['status'],
        ],
        'problem_reports' => [
            'problem_reports_status_index' => ['status'],
        ],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            foreach ($indexes as $name => $columns) {
                if (!Schema::hasColumns($table, $columns) || Schema::hasIndex($table, $name)) {
                    continue;
                }

                Schema::table($table, fn (Blueprint $t) => $t->index($columns, $name));
            }
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            foreach (array_keys($indexes) as $name) {
                if (!Schema::hasIndex($table, $name)) {
                    continue;
                }

                try {
                    Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
                } catch (\Throwable) {
                    // MySQL : index repris par une clé étrangère (il reste alors en place, sans gêner).
                }
            }
        }
    }
};
