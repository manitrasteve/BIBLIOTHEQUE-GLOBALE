<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - abstract : TEXT est limité à 65 535 octets, alors que la validation compte des caractères : un long
 *   résumé en alphabet non latin provoquait une erreur 500. MEDIUMTEXT le contient toujours.
 * - status_before_schedule : statut à retrouver quand une programmation est annulée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->string('status_before_schedule', 30)->nullable();
        });

        if (in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            Schema::table('documents', function (Blueprint $table) {
                $table->mediumText('abstract')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        // abstract reste en MEDIUMTEXT : le repasser en TEXT tronquerait ou refuserait les longs résumés.
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn('status_before_schedule');
        });
    }
};
