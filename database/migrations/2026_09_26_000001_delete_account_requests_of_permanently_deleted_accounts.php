<?php

use App\Models\AccountRequest;
use Illuminate\Database\Migrations\Migration;

/**
 * Demandes dont le compte a été supprimé définitivement avant que la suppression ne les retire
 * aussi : elles restaient affichées « En attente » avec un lien impossible à renvoyer.
 * Seules les demandes ayant reçu un numéro de compte (donc un compte créé) et n'ayant plus de
 * compte associé sont concernées ; les demandes jamais validées ne sont pas touchées.
 */
return new class extends Migration
{
    public function up(): void
    {
        AccountRequest::query()->orphaned()->delete();
    }

    public function down(): void
    {
        // Suppression définitive : rien à restaurer.
    }
};
