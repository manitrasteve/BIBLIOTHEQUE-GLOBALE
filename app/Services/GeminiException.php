<?php

namespace App\Services;

use RuntimeException;

/**
 * Erreur renvoyée par l'API Gemini, avec le statut HTTP d'origine
 * (0 si aucune requête n'a pu être faite).
 */
class GeminiException extends RuntimeException
{
    public function __construct(string $message, private readonly int $status = 0)
    {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }
}
