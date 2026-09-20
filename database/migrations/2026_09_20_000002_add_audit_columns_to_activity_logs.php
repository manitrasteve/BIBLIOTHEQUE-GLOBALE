<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Journal d'audit : QUI (user_id) · QUOI (action) · SUR QUEL ÉLÉMENT (subject_*, subject_label) ·
 * DANS QUELLE BIBLIOTHÈQUE (library_id) · QUAND (created_at) · AVANT/APRÈS (changes).
 * Colonnes additives et nullables : les entrées existantes restent valides.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('library_id')->nullable()->after('subject_id');
            // Nom / titre de l'élément au moment de l'action (reste lisible après suppression).
            $table->string('subject_label')->nullable()->after('library_id');
            // Avant / après d'une modification : {"champ": {"before": ..., "after": ...}}
            $table->json('changes')->nullable()->after('subject_label');

            $table->index(['subject_type', 'subject_id'], 'activity_logs_subject_index');
            $table->index(['library_id', 'created_at'], 'activity_logs_library_created_index');
        });

        // Rétro-remplissage des anciennes entrées à partir de leur élément (si il existe encore).
        DB::table('activity_logs')->where('subject_type', 'App\\Models\\Document')->update([
            'subject_label' => DB::raw('(select title from documents where documents.id = activity_logs.subject_id)'),
            'library_id' => DB::raw('(select library_id from documents where documents.id = activity_logs.subject_id)'),
        ]);
        DB::table('activity_logs')->where('subject_type', 'App\\Models\\User')->update([
            'subject_label' => DB::raw('(select name from users where users.id = activity_logs.subject_id)'),
            'library_id' => DB::raw('(select library_id from users where users.id = activity_logs.subject_id)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex('activity_logs_subject_index');
            $table->dropIndex('activity_logs_library_created_index');
            $table->dropColumn(['library_id', 'subject_label', 'changes']);
        });
    }
};
