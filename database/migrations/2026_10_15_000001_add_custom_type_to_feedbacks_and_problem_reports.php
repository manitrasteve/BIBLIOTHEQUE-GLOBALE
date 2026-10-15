<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Type « Autre » d'un avis ou d'un signalement : l'utilisateur précise lui-même le type.
return new class extends Migration
{
    public function up(): void
    {
        foreach (['feedbacks', 'problem_reports'] as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (!Schema::hasColumn($table, 'custom_type')) {
                    $t->string('custom_type', 100)->nullable()->after('type');
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['feedbacks', 'problem_reports'] as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (Schema::hasColumn($table, 'custom_type')) {
                    $t->dropColumn('custom_type');
                }
            });
        }
    }
};
