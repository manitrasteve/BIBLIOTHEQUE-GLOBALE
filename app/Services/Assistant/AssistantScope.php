<?php

namespace App\Services\Assistant;

use App\Models\User;

/**
 * Périmètre de données d'un assistant. Il est TOUJOURS déduit de l'utilisateur authentifié,
 * jamais d'une valeur fournie par le client ou par Gemini :
 *  - administrateur : toutes les bibliothèques ;
 *  - bibliothécaire : Bibliothèque Numérique Globale — toutes les bibliothèques également.
 */
final class AssistantScope
{
    private function __construct(
        public readonly string $role,
        public readonly int $userId,
        public readonly ?int $libraryId,
        public readonly ?string $libraryName,
    ) {
    }

    public static function for(User $user): self
    {
        if (!$user->is_active) {
            throw new AssistantAccessException('Compte inactif.');
        }

        if ($user->isAdmin()) {
            return new self('administrateur', $user->id, null, null);
        }

        if ($user->isLibrarian()) {
            return new self('bibliothecaire', $user->id, null, null);
        }

        throw new AssistantAccessException("Cet assistant est réservé à l'équipe de gestion.");
    }

    public function isAdmin(): bool
    {
        return $this->role === 'administrateur';
    }

    /** Bibliothèque Numérique Globale : vrai pour l'administrateur ET le bibliothécaire (aucune bibliothèque unique imposée). */
    public function isGlobal(): bool
    {
        return $this->libraryId === null;
    }
}
