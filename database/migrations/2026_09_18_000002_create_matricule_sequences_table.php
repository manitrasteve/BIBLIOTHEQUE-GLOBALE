<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matricule_sequences', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('year');
            $table->string('role', 40);
            $table->unsignedInteger('next_number')->default(1);
            $table->timestamps();
            $table->unique(['year', 'role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matricule_sequences');
    }
};