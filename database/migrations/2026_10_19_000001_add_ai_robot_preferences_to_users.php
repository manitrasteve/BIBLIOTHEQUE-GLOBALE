<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Robot assistant flottant : affiché ou non, et de quel côté de l'écran (préférence de chaque compte).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            if (!Schema::hasColumn('users', 'show_ai_robot')) {
                $t->boolean('show_ai_robot')->default(true);
            }
            if (!Schema::hasColumn('users', 'ai_robot_position')) {
                $t->string('ai_robot_position', 5)->default('right');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            foreach (['show_ai_robot', 'ai_robot_position'] as $column) {
                if (Schema::hasColumn('users', $column)) {
                    $t->dropColumn($column);
                }
            }
        });
    }
};
