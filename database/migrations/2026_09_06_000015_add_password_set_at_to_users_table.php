<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('account_requests', 'role')) {
                $table->string('role')->default('etudiant')->after('address');
            }
        });
    }

    public function down(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (Schema::hasColumn('account_requests', 'role')) {
                $table->dropColumn('role');
            }
        });
    }
};