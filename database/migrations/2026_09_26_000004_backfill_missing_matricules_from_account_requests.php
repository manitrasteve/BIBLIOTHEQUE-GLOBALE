<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Comptes créés directement par l'administrateur avant correction : le numéro de compte avait été
// attribué à la demande et au registre des membres, mais pas au compte lui-même. On le recopie
// depuis la demande, sans jamais écraser un numéro existant ni en dupliquer un déjà utilisé.
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('users')
            ->join('account_requests', 'account_requests.created_user_id', '=', 'users.id')
            ->whereNull('users.matricule')
            ->whereNotNull('account_requests.matricule')
            ->orderByDesc('account_requests.id')
            ->get(['users.id', 'account_requests.matricule']);

        foreach ($rows->unique('id') as $row) {
            $taken = DB::table('users')->where('matricule', $row->matricule)->exists();
            if (! $taken) {
                DB::table('users')->where('id', $row->id)->whereNull('matricule')->update(['matricule' => $row->matricule]);
            }
        }
    }

    public function down(): void
    {
        // Données corrigées : rien à annuler.
    }
};
