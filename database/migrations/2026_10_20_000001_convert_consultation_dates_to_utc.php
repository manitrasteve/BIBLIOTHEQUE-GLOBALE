<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Les consultations prenaient la date par défaut de MySQL (CURRENT_TIMESTAMP), à l'heure de la session
// (+03:00 sous XAMPP), alors que toutes les autres dates sont en UTC. Le modèle fixe désormais la date en
// UTC ; cette migration ramène les consultations existantes en UTC en retirant le décalage de la session.
// Sans effet si la session MySQL est déjà en UTC, et sous SQLite (CURRENT_TIMESTAMP y est en UTC).
return new class extends Migration
{
    public function up(): void
    {
        $offset = $this->sessionOffsetSeconds();
        if ($offset !== 0) {
            DB::table('consultations')->update([
                'consulted_at' => DB::raw('DATE_SUB(consulted_at, INTERVAL ' . $offset . ' SECOND)'),
            ]);
        }
    }

    public function down(): void
    {
        $offset = $this->sessionOffsetSeconds();
        if ($offset !== 0) {
            DB::table('consultations')->update([
                'consulted_at' => DB::raw('DATE_ADD(consulted_at, INTERVAL ' . $offset . ' SECOND)'),
            ]);
        }
    }

    private function sessionOffsetSeconds(): int
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return 0;
        }

        // Arrondi au quart d'heure (les fuseaux sont des multiples de 15 minutes).
        $seconds = (int) DB::selectOne('SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS s')->s;

        return (int) (round($seconds / 900) * 900);
    }
};
