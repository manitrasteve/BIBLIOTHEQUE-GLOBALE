<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Couleurs du thème global (Paramètres → Apparence du site), même principe que homepage_versions :
        // une ligne « draft » (au plus une) = brouillon ; chaque publication crée une ligne « published »
        // numérotée, jamais modifiée ensuite (historique). La plus récente publiée est le thème actif.
        Schema::create('theme_versions', function (Blueprint $table) {
            $table->id();
            $table->string('status', 20); // draft | published
            $table->unsignedInteger('version')->nullable()->unique(); // null pour le brouillon
            $table->json('colors'); // { "light": { primary: "#rrggbb", … }, "dark": { … } }
            $table->boolean('is_default')->default(false); // version créée par « Restaurer le thème par défaut »
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('theme_versions');
    }
};
