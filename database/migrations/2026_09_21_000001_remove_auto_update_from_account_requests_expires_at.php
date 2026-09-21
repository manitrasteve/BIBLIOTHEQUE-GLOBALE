<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `expires_at` était déclarée `$table->timestamp('expires_at')` (NOT NULL, sans défaut explicite). Sur MySQL/MariaDB
 * avec `explicit_defaults_for_timestamp` désactivé, la colonne est devenue
 * `DEFAULT current_timestamp() ON UPDATE current_timestamp()` : la date d'expiration d'une demande était donc
 * réécrite à chaque UPDATE qui ne la fixait pas explicitement (ex. marquage « expirée », création du mot de passe).
 *
 * Cette migration retire uniquement le comportement `ON UPDATE` : type, NOT NULL, défaut et valeurs existantes
 * sont conservés.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE `account_requests` MODIFY `expires_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
        }
    }

    public function down(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE `account_requests` MODIFY `expires_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        }
    }
};
