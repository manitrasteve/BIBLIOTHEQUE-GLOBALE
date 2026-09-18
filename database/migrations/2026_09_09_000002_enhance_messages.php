<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_messages', function (Blueprint $table) {
            if (!Schema::hasColumn('admin_messages', 'deleted_by_sender_at')) $table->timestamp('deleted_by_sender_at')->nullable()->after('failure_count');
        });

        Schema::table('admin_message_recipients', function (Blueprint $table) {
            if (!Schema::hasColumn('admin_message_recipients', 'read_at')) $table->timestamp('read_at')->nullable()->after('status');
            if (!Schema::hasColumn('admin_message_recipients', 'deleted_at')) $table->timestamp('deleted_at')->nullable()->after('read_at');
        });
    }

    public function down(): void
    {
        Schema::table('admin_message_recipients', function (Blueprint $table) {
            foreach (['read_at', 'deleted_at'] as $column) if (Schema::hasColumn('admin_message_recipients', $column)) $table->dropColumn($column);
        });
        Schema::table('admin_messages', function (Blueprint $table) {
            if (Schema::hasColumn('admin_messages', 'deleted_by_sender_at')) $table->dropColumn('deleted_by_sender_at');
        });
    }
};
