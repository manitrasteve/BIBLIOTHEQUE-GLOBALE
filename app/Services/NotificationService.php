<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;

class NotificationService
{
    public static function send(User $user, string $type, string $title, ?string $message = null, ?object $related = null): AppNotification
    {
        return AppNotification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'related_type' => $related?->getMorphClass(),
            'related_id' => $related?->getKey(),
        ]);
    }

    public static function sendToRole(string $role, string $type, string $title, ?string $message = null, ?object $related = null): void
    {
        User::where('role', $role)->get()->each(
            fn (User $u) => self::send($u, $type, $title, $message, $related)
        );
    }
}
