<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Demandes d'un enseignant pour enseigner dans une classe (établissement + niveau).
 * Le Service Numérique ou l'administrateur la valide (la classe est alors attribuée) ou la refuse avec un motif.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teacher_class_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('school');
            $table->string('level', 20);
            $table->string('message', 1000)->nullable();
            $table->string('status', 20)->default('en_attente'); // en_attente | acceptee | refusee
            $table->string('reason', 1000)->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teacher_class_requests');
    }
};
