<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Recherche du catalogue : index plein texte (pertinence, recherche dans le résumé).
// MySQL / MariaDB uniquement ; ailleurs (SQLite des tests), la recherche reste en LIKE.
return new class extends Migration
{
    public function up(): void
    {
        if (! in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        Schema::table('documents', function (Blueprint $table) {
            $table->fullText(['title', 'subtitle', 'abstract', 'keywords'], 'documents_search_fulltext');
        });
    }

    public function down(): void
    {
        if (! in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        Schema::table('documents', function (Blueprint $table) {
            $table->dropFullText('documents_search_fulltext');
        });
    }
};
