<?php

namespace App\Support;

/**
 * Motifs LIKE construits à partir d'une saisie utilisateur : « % » et « _ » y sont des caractères
 * ordinaires (sans échappement, chercher « _ » ou « 100% » renvoyait tout le catalogue).
 */
class Like
{
    public static function escape(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    /** Contient la saisie, n'importe où. */
    public static function contains(string $value): string
    {
        return '%' . self::escape($value) . '%';
    }

    /** Commence par la saisie. */
    public static function startsWith(string $value): string
    {
        return self::escape($value) . '%';
    }
}
