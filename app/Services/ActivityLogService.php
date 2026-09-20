<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Library;
use Illuminate\Database\Eloquent\Model;

class ActivityLogService
{
    /**
     * Enregistre une action (toujours côté serveur, jamais déclarée par le frontend).
     *
     * $subject : élément concerné (document, bibliothèque, utilisateur…). Son libellé et sa
     * bibliothèque sont déduits automatiquement ; $libraryId force la bibliothèque si besoin.
     * $changes : avant/après d'une modification, voir diff().
     */
    public static function log(
        ?int $userId,
        string $action,
        ?string $description = null,
        ?Model $subject = null,
        ?array $changes = null,
        ?int $libraryId = null,
    ): ActivityLog {
        return ActivityLog::create([
            'user_id' => $userId,
            'action' => $action,
            'description' => $description,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'subject_label' => self::labelOf($subject),
            'library_id' => $libraryId ?? self::libraryIdOf($subject),
            'changes' => $changes ?: null,
        ]);
    }

    /**
     * Différences entre deux états : ne retourne que les champs réellement modifiés.
     * Valeurs vides et null sont équivalentes ; les nombres et textes sont comparés comme du texte.
     *
     * @return array<string, array{before: mixed, after: mixed}>
     */
    public static function diff(array $before, array $after): array
    {
        $normalize = fn ($value) => ($value === null || $value === '') ? null : (is_array($value) ? $value : (string) $value);
        $changes = [];

        foreach ($after as $field => $newValue) {
            $old = $normalize($before[$field] ?? null);
            $new = $normalize($newValue);

            if ($old !== $new) {
                $changes[$field] = ['before' => $old, 'after' => $new];
            }
        }

        return $changes;
    }

    private static function labelOf(?Model $subject): ?string
    {
        if (!$subject) {
            return null;
        }

        $label = $subject->getAttribute('title') ?? $subject->getAttribute('name');

        return $label !== null ? mb_substr((string) $label, 0, 255) : null;
    }

    private static function libraryIdOf(?Model $subject): ?int
    {
        if (!$subject) {
            return null;
        }

        $id = $subject instanceof Library ? $subject->getKey() : $subject->getAttribute('library_id');

        return $id !== null ? (int) $id : null;
    }
}
