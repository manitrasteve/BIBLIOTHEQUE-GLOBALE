<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'birth_place')) $table->string('birth_place')->nullable()->after('date_of_birth');
            if (!Schema::hasColumn('users', 'cin_number')) $table->string('cin_number', 12)->nullable()->after('birth_place');
            if (!Schema::hasColumn('users', 'cin_issued_at')) $table->date('cin_issued_at')->nullable()->after('cin_number');
            if (!Schema::hasColumn('users', 'student_card_number')) $table->string('student_card_number')->nullable()->after('cin_issued_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach (['birth_place', 'cin_number', 'cin_issued_at', 'student_card_number'] as $column) {
                if (Schema::hasColumn('users', $column)) $table->dropColumn($column);
            }
        });
    }
};