<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Historique des recherches lancées explicitement depuis l'Espace recherche.
        Schema::create('search_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('query');
            $table->json('filters')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });

        // Thèmes suivis (veille scientifique) : un mot-clé libre ou un domaine (catégorie).
        Schema::create('watch_topics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 20); // mot_cle | domaine
            $table->string('term')->nullable();
            $table->foreignId('category_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watch_topics');
        Schema::dropIfExists('search_histories');
    }
};
