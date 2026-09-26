<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Dernière page lue d'un document, par lecteur (« Reprendre la lecture »).
        Schema::create('reading_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('last_page')->default(1);
            $table->unsignedInteger('total_pages')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'document_id']);
        });

        // Notes personnelles d'un lecteur, rattachées à une page du document (visibles de lui seul).
        Schema::create('document_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('page');
            $table->text('body');
            $table->string('color', 20)->default('jaune');
            $table->timestamps();

            $table->index(['user_id', 'document_id', 'page']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_notes');
        Schema::dropIfExists('reading_progress');
    }
};
