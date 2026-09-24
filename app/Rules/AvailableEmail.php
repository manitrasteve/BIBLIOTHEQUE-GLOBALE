<?php

namespace App\Rules;

use App\Models\User;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Adresse e-mail libre pour un nouveau compte (voir User::emailUnavailableMessage) :
 * refusée si un compte l'utilise, y compris dans la corbeille ; de nouveau acceptée
 * après la suppression définitive de ce compte.
 */
class AvailableEmail implements ValidationRule
{
    public function __construct(private ?int $exceptUserId = null) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && ($message = User::emailUnavailableMessage($value, $this->exceptUserId))) {
            $fail($message);
        }
    }
}
