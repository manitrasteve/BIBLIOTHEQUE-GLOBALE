<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Configuration de la page d'accueil publique gérée par l'administrateur.
        // Une ligne « draft » (au plus une) = brouillon en cours ; chaque publication crée une
        // ligne « published » numérotée, jamais modifiée ensuite (historique et restauration).
        Schema::create('homepage_versions', function (Blueprint $table) {
            $table->id();
            $table->string('status', 20); // draft | published
            $table->unsignedInteger('version')->nullable()->unique(); // null pour le brouillon
            $table->json('content'); // { "sections": [ { id, type, visible, content, style } ] }
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('restored_from')->nullable(); // version d'origine d'une restauration
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('homepage_versions');
    }
};
