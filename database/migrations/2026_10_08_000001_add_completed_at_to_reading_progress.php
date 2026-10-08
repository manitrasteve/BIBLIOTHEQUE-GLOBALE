<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * « Lu en entier » ne doit pas disparaître quand le lecteur revient sur une page précédente :
 * la date d'atteinte de la dernière page est conservée à part de la dernière page lue.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reading_progress', function (Blueprint $table) {
            $table->timestamp('completed_at')->nullable()->after('total_pages');
        });

        // Lectures déjà terminées : marquées comme lues.
        DB::table('reading_progress')
            ->whereNotNull('total_pages')
            ->whereColumn('last_page', '>=', 'total_pages')
            ->update(['completed_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('reading_progress', function (Blueprint $table) {
            $table->dropColumn('completed_at');
        });
    }
};
