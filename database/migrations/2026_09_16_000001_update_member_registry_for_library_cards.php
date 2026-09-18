<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('member_registries')) return;

        Schema::table('member_registries', function (Blueprint $table) {
            if (!Schema::hasColumn('member_registries', 'library_id')) {
                $table->foreignId('library_id')->nullable()->after('id')->constrained('libraries')->nullOnDelete();
            }
            if (!Schema::hasColumn('member_registries', 'card_number')) {
                $table->string('card_number', 80)->nullable()->after('library_id');
            }
            $table->index(['library_id', 'status']);
            $table->unique(['library_id', 'card_number']);
        });

        // L'ancien registre ne connaissait pas le numéro de carte physique.
        // Les anciennes fiches restent donc conservées sans inventer de carte.
        // Les nouvelles fiches utilisent obligatoirement library_id + card_number.
    }

    public function down(): void
    {
        if (!Schema::hasTable('member_registries')) return;

        Schema::table('member_registries', function (Blueprint $table) {
            if (Schema::hasColumn('member_registries', 'library_id')) {
                $table->dropConstrainedForeignId('library_id');
            }
            if (Schema::hasColumn('member_registries', 'card_number')) {
                $table->dropColumn('card_number');
            }
        });
    }
};
