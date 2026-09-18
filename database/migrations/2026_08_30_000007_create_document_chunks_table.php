<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_chunks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();
            $table->unsignedInteger('page_number')->nullable();
            $table->unsignedInteger('chunk_index')->default(0);
            $table->longText('content');
            // embedding stocké en JSON (tableau de floats) pour compat MySQL,
            // migrable plus tard vers pgvector si besoin
            $table->json('embedding')->nullable();
            $table->timestamps();

            $table->index(['document_id', 'chunk_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_chunks');
    }
};
