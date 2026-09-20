<?php

namespace App\Services\Assistant;

use RuntimeException;

// Accès refusé à un assistant de gestion (rôle non autorisé, compte inactif, bibliothécaire sans bibliothèque).
class AssistantAccessException extends RuntimeException
{
}
