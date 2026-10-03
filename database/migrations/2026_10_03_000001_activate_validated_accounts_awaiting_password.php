<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Une demande validée donne désormais un compte actif tout de suite (il ne reste qu'à créer le mot de passe).
 * Les comptes déjà validés qui attendaient leur mot de passe, encore inactifs, deviennent actifs :
 * demande « validee » avec un lien en cours, ou compte réactivé (lien de création dans password_reset_tokens).
 * Les comptes désactivés ne sont pas concernés : la désactivation supprime ces liens.
 */
return new class extends Migration
{
    public function up(): void
    {
        $fromRequests = DB::table('account_requests')
            ->where('status', 'validee')
            ->whereNotNull('setup_token_hash')
            ->whereNotNull('created_user_id')
            ->pluck('created_user_id');

        DB::table('users')
            ->where('is_active', false)
            ->whereNull('password_set_at')
            ->whereIn('role', ['etudiant', 'enseignant', 'chercheur'])
            ->where(function ($query) use ($fromRequests) {
                $query->whereIn('id', $fromRequests)
                    ->orWhereIn('email', DB::table('password_reset_tokens')->select('email'));
            })
            ->update(['is_active' => true]);
    }

    public function down(): void
    {
        // Données : pas de retour en arrière (impossible de distinguer ces comptes après coup).
    }
};
