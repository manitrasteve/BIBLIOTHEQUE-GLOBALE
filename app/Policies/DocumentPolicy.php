<?php

namespace App\Policies;

use App\Models\Document;
use App\Models\User;

class DocumentPolicy
{
    public function manage(User $user): bool
    {
        return in_array($user->role, ['administrateur', 'bibliothecaire'], true);
    }

    public function view(User $user, Document $document): bool
    {
        if ($this->manage($user)) {
            return true;
        }

        return match ($document->access_level) {
            'public', 'authentifie' => $user->is_active,
            'restreint' => $user->is_active && $user->library_id === $document->library_id,
            default => false,
        };
    }

    public function publish(User $user): bool
    {
        return $this->manage($user);
    }
}
