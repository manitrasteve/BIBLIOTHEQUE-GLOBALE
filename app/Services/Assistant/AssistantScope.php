<?php

namespace App\Services\Assistant;

use App\Models\User;

/**
 * Périmètre de données d'un assistant. Il est TOUJOURS déduit de l'utilisateur authentifié,
 * jamais d'une valeur fournie par le client ou par Gemini :
 *  - administrateur : toutes les bibliothèques ;
 *  - bibliothécaire : uniquement sa propre bibliothèque (users.library_id).
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
            if (!$user->library_id) {
                throw new AssistantAccessException("Aucune bibliothèque n'est associée à votre compte.");
            }

            return new self('bibliothecaire', $user->id, (int) $user->library_id, $user->library?->name);
        }

        throw new AssistantAccessException("Cet assistant est réservé à l'équipe de gestion.");
    }

    public function isAdmin(): bool
    {
        return $this->role === 'administrateur';
    }
}
