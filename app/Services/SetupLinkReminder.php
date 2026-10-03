<?php

namespace App\Services;

use App\Models\AccountRequest;
use App\Models\User;

/**
 * Rappel « créez votre mot de passe » : envoyé une seule fois, dans les dernières heures avant l'expiration
 * du lien, à une personne dont la demande est validée mais qui n'a pas encore créé son mot de passe.
 *
 * Le lien n'est conservé que sous forme d'empreinte : le rappel contient donc un nouveau lien, qui remplace
 * le précédent SANS prolonger le délai (même date d'expiration).
 */
class SetupLinkReminder
{
    /** Le rappel part quand il reste moins de ce nombre d'heures avant l'expiration. */
    public const HOURS_BEFORE_EXPIRY = 24;

    public function __construct(private AccountProvisioner $provisioner) {}

    /** Envoie les rappels dus ; renvoie le nombre d'e-mails envoyés. */
    public function sendDue(): int
    {
        $due = AccountRequest::where('status', 'validee')
            ->whereNotNull('setup_token_hash')
            ->whereNull('setup_reminder_sent_at')
            ->whereNotNull('created_user_id')
            ->where('setup_expires_at', '>', now())
            ->where('setup_expires_at', '<=', now()->addHours(self::HOURS_BEFORE_EXPIRY))
            ->get();

        $sent = 0;
        foreach ($due as $accountRequest) {
            $user = User::find($accountRequest->created_user_id);

            // Compte supprimé, désactivé ou mot de passe déjà créé : aucun rappel (et plus de nouvelle tentative).
            if (!$user || !$user->is_active || $user->password_set_at !== null) {
                $accountRequest->update(['setup_reminder_sent_at' => now()]);
                continue;
            }

            [$token, $tokenHash] = $this->provisioner->newSetupToken();

            try {
                $this->provisioner->sendSetupMail($user, $accountRequest, $token, 'Rappel : créez votre mot de passe', 'reminder', $accountRequest->email);
            } catch (\Throwable $e) {
                // Envoi impossible (serveur de messagerie injoignable) : l'ancien lien reste valable, nouvel essai plus tard.
                report($e);
                continue;
            }

            // E-mail parti : le nouveau lien remplace l'ancien. Délai inchangé (setup_expires_at non modifié).
            $accountRequest->update(['setup_token_hash' => $tokenHash, 'setup_reminder_sent_at' => now()]);
            $sent++;
        }

        return $sent;
    }
}
