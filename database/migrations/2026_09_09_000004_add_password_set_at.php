<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'password_set_at')) $table->timestamp('password_set_at')->nullable()->after('password');
        });
        DB::table('users')->where('is_active', true)->whereNull('password_set_at')->update(['password_set_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'password_set_at')) $table->dropColumn('password_set_at');
        });
    }
};
