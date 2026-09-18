<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('users', function (Blueprint $table) {
            $columns = [
                'date_of_birth' => fn() => $table->date('date_of_birth')->nullable(),
                'photo_path' => fn() => $table->string('photo_path')->nullable(),
                'faculty' => fn() => $table->string('faculty')->nullable(),
                'department' => fn() => $table->string('department')->nullable(),
                'position' => fn() => $table->string('position')->nullable(),
                'teaching_specialty' => fn() => $table->string('teaching_specialty')->nullable(),
                'research_lab' => fn() => $table->string('research_lab')->nullable(),
            ];
            foreach ($columns as $name => $add) if (!Schema::hasColumn('users', $name)) $add();
        });
        Schema::table('account_requests', function (Blueprint $table) {
            $columns = [
                'date_of_birth' => fn() => $table->date('date_of_birth')->nullable(),
                'faculty' => fn() => $table->string('faculty')->nullable(),
                'department' => fn() => $table->string('department')->nullable(),
                'position' => fn() => $table->string('position')->nullable(),
                'teaching_specialty' => fn() => $table->string('teaching_specialty')->nullable(),
                'research_lab' => fn() => $table->string('research_lab')->nullable(),
            ];
            foreach ($columns as $name => $add) if (!Schema::hasColumn('account_requests', $name)) $add();
        });
    }
    public function down(): void {
        foreach (['date_of_birth','photo_path','faculty','department','position','teaching_specialty','research_lab'] as $c) {
            if (Schema::hasColumn('users',$c)) Schema::table('users', fn(Blueprint $t) => $t->dropColumn($c));
        }
        foreach (['date_of_birth','faculty','department','position','teaching_specialty','research_lab'] as $c) {
            if (Schema::hasColumn('account_requests',$c)) Schema::table('account_requests', fn(Blueprint $t) => $t->dropColumn($c));
        }
    }
};
