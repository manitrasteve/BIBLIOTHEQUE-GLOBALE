<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('account_requests', 'card_number')) {
                // Numéro de carte du membre déjà inscrit au registre physique (parcours « recreate »),
                // pour relier la demande à sa fiche member_registries existante lors de la validation.
                $table->string('card_number', 80)->nullable()->after('library_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (Schema::hasColumn('account_requests', 'card_number')) {
                $table->dropColumn('card_number');
            }
        });
    }
};
