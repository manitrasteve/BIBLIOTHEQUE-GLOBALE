<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Le type YEAR de MySQL / MariaDB n'accepte que 1901-2155 : un ouvrage plus ancien provoquait une
 * erreur 500 à l'enregistrement. Les valeurs existantes sont conservées. Sans objet pour SQLite,
 * où la colonne est déjà un simple entier.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        Schema::table('documents', function (Blueprint $table) {
            $table->unsignedSmallInteger('year')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (! in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        // Le type YEAR ne peut pas contenir ces années : elles sont vidées pour que le retour arrière aboutisse.
        DB::table('documents')->where(fn ($q) => $q->where('year', '<', 1901)->where('year', '!=', 0)->orWhere('year', '>', 2155))->update(['year' => null]);

        Schema::table('documents', function (Blueprint $table) {
            $table->year('year')->nullable()->change();
        });
    }
};
