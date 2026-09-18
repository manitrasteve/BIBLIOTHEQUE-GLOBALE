<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'matricule')) {
        Schema::table('users', function (Blueprint $table) {
            $table->string('matricule')->nullable()->unique()->after('uuid');
        });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'matricule')) {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('matricule');
        });
        }
    }
};
