<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('slug')->unique();

            $table->string('title');
            $table->string('subtitle')->nullable();
            $table->text('abstract')->nullable();

           // livre | memoire | these | rapport | autre
$table->string('type')->default('memoire');

// L1 | L2 | L3 | M1 | M2 | Doctorat
$table->string('niveau')->nullable();

$table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->foreignId('library_id')->constrained('libraries')->cascadeOnDelete();

            $table->year('year')->nullable();
            $table->string('publisher')->nullable();
            $table->string('isbn')->nullable();
            $table->string('language')->default('fr');
            $table->string('edition')->nullable();
            $table->string('keywords')->nullable();

            $table->string('cover_path')->nullable();
            $table->string('file_path'); // storage/app/private/documents/...

            // public | authentifie | restreint
            $table->string('access_level')->default('authentifie');
            // brouillon | publie | archive
            $table->string('status')->default('brouillon');

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};