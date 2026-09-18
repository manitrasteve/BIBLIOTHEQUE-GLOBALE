<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('account_requests', 'birth_place')) {
                $table->string('birth_place')->nullable()->after('date_of_birth');
            }
            if (!Schema::hasColumn('account_requests', 'cin_number')) {
                $table->string('cin_number', 12)->nullable()->after('birth_place');
            }
            if (!Schema::hasColumn('account_requests', 'cin_issued_at')) {
                $table->date('cin_issued_at')->nullable()->after('cin_number');
            }
            if (!Schema::hasColumn('account_requests', 'student_card_number')) {
                $table->string('student_card_number')->nullable()->after('niveau_detail');
            }
        });
    }

    public function down(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            foreach (['birth_place', 'cin_number', 'cin_issued_at', 'student_card_number'] as $column) {
                if (Schema::hasColumn('account_requests', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};