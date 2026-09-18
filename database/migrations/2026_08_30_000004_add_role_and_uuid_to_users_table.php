<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'uuid')) {
                $table->uuid('uuid')->unique()->nullable()->after('id');
            }
            if (!Schema::hasColumn('users', 'role')) {
                // administrateur | bibliothecaire | responsable | etudiant | chercheur | enseignant | autre
                $table->string('role')->default('etudiant')->after('email');
            }
            if (!Schema::hasColumn('users', 'address')) {
                $table->string('address')->nullable()->after('role');
            }
            if (!Schema::hasColumn('users', 'library_id')) {
                $table->foreignId('library_id')->nullable()->after('address')
                    ->constrained('libraries')->nullOnDelete();
            }
            if (!Schema::hasColumn('users', 'is_active')) {
                // false tant que l'Administrateur n'a pas validé le compte
                $table->boolean('is_active')->default(false)->after('library_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('library_id');
            $table->dropColumn(['uuid', 'role', 'address', 'is_active']);
        });
    }
};
