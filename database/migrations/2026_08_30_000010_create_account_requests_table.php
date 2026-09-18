<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            // ex: BM-2026-0001
            $table->string('request_number')->unique();

            $table->string('last_name');
            $table->string('first_name');
            $table->string('address')->nullable();

            $table->foreignId('library_id')->constrained('libraries')->cascadeOnDelete();

            // en_attente | traitee | expiree | rejetee
            $table->string('status')->default('en_attente');
            $table->timestamp('expires_at'); // création + 5 jours

            // rempli une fois le compte créé par le bibliothécaire
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_requests');
    }
};
