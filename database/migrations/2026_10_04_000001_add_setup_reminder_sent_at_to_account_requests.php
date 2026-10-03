<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rappel « créez votre mot de passe » envoyé avant l'expiration du lien (une seule fois par lien).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            $table->timestamp('setup_reminder_sent_at')->nullable()->after('setup_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('account_requests', function (Blueprint $table) {
            $table->dropColumn('setup_reminder_sent_at');
        });
    }
};
