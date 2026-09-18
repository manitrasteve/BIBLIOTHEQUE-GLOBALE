<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Nommée "app_notifications" pour ne pas entrer en conflit avec la table
    // "notifications" native de Laravel si tu utilises aussi ses notifications système.
    public function up(): void
    {
        Schema::create('app_notifications', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            // document_publie | compte_valide | compte_expire | autre
            $table->string('type');
            $table->string('title');
            $table->text('message')->nullable();

            // polymorphe simple vers l'objet concerné (document, account_request...)
            $table->string('related_type')->nullable();
            $table->unsignedBigInteger('related_id')->nullable();

            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_notifications');
    }
};
