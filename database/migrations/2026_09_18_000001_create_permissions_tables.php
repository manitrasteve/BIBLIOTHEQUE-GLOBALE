<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('label');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('user_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'permission_id']);
        });

        DB::table('permissions')->insert([
            ['name' => 'voir_corbeille', 'label' => 'Accéder à la Corbeille', 'description' => 'Consulter et gérer les éléments supprimés.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'ajouter_document', 'label' => 'Ajouter des documents', 'description' => 'Créer de nouveaux documents.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'modifier_document', 'label' => 'Modifier les documents', 'description' => 'Modifier ou archiver des documents.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'supprimer_document', 'label' => 'Supprimer les documents', 'description' => 'Supprimer des documents.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'publier_document', 'label' => 'Publier des documents', 'description' => 'Publier des documents.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'voir_liste_membres', 'label' => 'Voir les membres', 'description' => 'Consulter la liste des membres.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'importer_membres', 'label' => 'Importer les membres', 'description' => 'Importer un registre de membres.', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'exporter_membres', 'label' => 'Exporter les membres', 'description' => 'Exporter le registre des membres.', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('user_permissions');
        Schema::dropIfExists('permissions');
    }
};
