<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('account_requests', 'email')) {
                $table->string('email')->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('account_requests', 'phone')) {
                $table->string('phone', 50)->nullable()->after('email');
            }
            if (!Schema::hasColumn('account_requests', 'gender')) {
                $table->string('gender', 20)->nullable()->after('phone');
            }
        });

        Schema::table('account_requests', function (Blueprint $table) {
            if (Schema::hasColumn('account_requests', 'library_id')) {
                $table->dropForeign(['library_id']);
                $table->foreignId('library_id')->nullable()->change();
                $table->foreign('library_id')->references('id')->on('libraries')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (Schema::hasColumn('account_requests', 'library_id')) {
                $table->dropForeign(['library_id']);
            }
            if (Schema::hasColumn('account_requests', 'email')) $table->dropColumn('email');
            if (Schema::hasColumn('account_requests', 'phone')) $table->dropColumn('phone');
            if (Schema::hasColumn('account_requests', 'gender')) $table->dropColumn('gender');
        });
    }
};
