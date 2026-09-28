<?php

namespace App\Services\Pollinations;

use RuntimeException;

/**
 * Pollinations refuse temporairement la requête (une seule à la fois par adresse IP
 * sans jeton) : réessayer après quelques secondes a une chance d'aboutir.
 */
class PollinationsRateLimited extends RuntimeException
{
}
