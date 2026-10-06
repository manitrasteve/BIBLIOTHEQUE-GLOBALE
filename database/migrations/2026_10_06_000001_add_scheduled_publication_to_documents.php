<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Publication programmée : un document au statut « programme » passe en « publie » à `scheduled_at`.
 * `scheduled_by` : auteur de la programmation (journal d'audit, exclu de la notification « nouveau document »).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->timestamp('scheduled_at')->nullable()->after('published_at');
            $table->foreignId('scheduled_by')->nullable()->after('scheduled_at')->constrained('users')->nullOnDelete();
            $table->index(['status', 'scheduled_at']);
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropIndex(['status', 'scheduled_at']);
            $table->dropConstrainedForeignId('scheduled_by');
            $table->dropColumn('scheduled_at');
        });
    }
};
