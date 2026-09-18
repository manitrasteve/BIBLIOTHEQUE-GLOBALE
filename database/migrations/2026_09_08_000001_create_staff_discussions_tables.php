<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /*
        |--------------------------------------------------------------------------
        | Conversations entre administrateur et bibliothécaire
        |--------------------------------------------------------------------------
        */
        Schema::create('staff_conversations', function (Blueprint $table) {
            $table->id();

            $table->foreignId('admin_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->foreignId('librarian_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->timestamps();

            /*
             * Une seule conversation entre un administrateur
             * et un bibliothécaire.
             */
            $table->unique(['admin_id', 'librarian_id']);
        });

        /*
        |--------------------------------------------------------------------------
        | Messages des conversations
        |--------------------------------------------------------------------------
        */
        Schema::create('staff_messages', function (Blueprint $table) {
            $table->id();

            $table->foreignId('conversation_id')
                ->constrained('staff_conversations')
                ->cascadeOnDelete();

            $table->foreignId('sender_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->foreignId('recipient_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->text('message');

            /*
             * Permet de savoir si le destinataire
             * a déjà lu le message.
             */
            $table->timestamp('read_at')->nullable();

            /*
             * Suppression personnelle du message.
             *
             * Si l'admin supprime son historique,
             * le message reste visible pour le bibliothécaire.
             *
             * Si le bibliothécaire supprime son historique,
             * le message reste visible pour l'admin.
             */
            $table->timestamp('deleted_by_sender_at')->nullable();
            $table->timestamp('deleted_by_recipient_at')->nullable();

            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
            $table->index(['recipient_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_messages');
        Schema::dropIfExists('staff_conversations');
    }
};