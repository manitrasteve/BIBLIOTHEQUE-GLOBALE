<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();
        Schema::dropIfExists('loans');
        Schema::dropIfExists('loan_requests');
        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // L'emprunt est volontairement retiré du produit et n'est pas recréé.
    }
};
