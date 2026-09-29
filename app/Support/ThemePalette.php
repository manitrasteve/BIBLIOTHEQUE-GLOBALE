<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * Couleurs personnalisables du thème global (Paramètres → Apparence du site).
 *
 * resources/css/app.css définit chaque variable de couleur utilisée par Tailwind sous la forme
 * var(--site-{mode}-{rôle}, valeur par défaut). Ce fichier produit uniquement ces variables
 * --site-* pour les couleurs qui diffèrent des valeurs par défaut : sans personnalisation
 * (ou après « Restaurer le thème par défaut »), aucune variable n'est émise et le site garde
 * exactement ses couleurs d'origine.
 *
 * Sécurité : le CSS n'est construit qu'à partir de valeurs HEX #rrggbb validées ici ; aucune
 * autre saisie n'y est jamais insérée.
 */
class ThemePalette
{
    public const MODES = ['light', 'dark'];

    /** Rôles personnalisables, dans l'ordre de l'interface. */
    public const KEYS = ['primary', 'secondary', 'accent', 'background', 'surface', 'foreground', 'border'];

    /**
     * Couleurs d'origine du projet : charte de l'Université de Mahajanga
     * (valeurs de repli de resources/css/app.css : à garder synchronisées).
     */
    public const DEFAULTS = [
        'light' => [
            'primary' => '#1a1a8c',     // boutons, menu actif, bandeaux (--color-indigo-500…800)
            'secondary' => '#9e6612',   // accent doré : liens, surtitres, icônes (--color-brass)
            'accent' => '#f4f5fb',      // fonds teintés : survols, puces, sélection (--color-indigo-50…300)
            'background' => '#f6f7fb',  // fond des pages (--color-canvas, --color-paper)
            'surface' => '#ffffff',     // cartes et panneaux (--color-surface)
            'foreground' => '#15212b',  // texte (--color-ink, slate-400…950)
            'border' => '#dde0ee',      // bordures (--color-line, slate-200/300)
        ],
        'dark' => [
            'primary' => '#2525a5',
            'secondary' => '#e4a525',
            'accent' => '#15183a',
            'background' => '#0a0b1c',
            'surface' => '#121429',
            'foreground' => '#e6e7f2',
            'border' => '#272b4a',
        ],
    ];

    public static function defaults(): array
    {
        return self::DEFAULTS;
    }

    /**
     * Valide et normalise une palette complète { light: {…}, dark: {…} }.
     *
     * @throws ValidationException
     */
    public static function validate(mixed $colors): array
    {
        $errors = [];
        $clean = [];

        foreach (self::MODES as $mode) {
            foreach (self::KEYS as $key) {
                $value = is_array($colors) && is_array($colors[$mode] ?? null) ? ($colors[$mode][$key] ?? null) : null;
                if (! is_string($value) || ! preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
                    $errors["colors.{$mode}.{$key}"] = ['Couleur invalide : utilisez le format HEX #RRGGBB.'];

                    continue;
                }
                $clean[$mode][$key] = strtolower($value);
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return $clean;
    }

    public static function isDefault(array $colors): bool
    {
        return $colors === self::DEFAULTS;
    }

    /**
     * Variables --site-* à injecter (vide si la palette est celle d'origine).
     * Les nuances dérivées (survol, texte atténué, fonds légers) sont calculées par color-mix()
     * dès qu'une des couleurs dont elles dépendent a changé.
     */
    public static function css(array $colors): string
    {
        $colors = self::validate($colors); // jamais de valeur non validée dans le CSS
        $vars = [];

        foreach (self::MODES as $mode) {
            $c = $colors[$mode];
            $changed = fn (string ...$keys) => (bool) array_filter($keys, fn ($k) => $c[$k] !== self::DEFAULTS[$mode][$k]);
            $mix = fn (string $a, int $percent, string $b) => "color-mix(in oklab, {$a} {$percent}%, {$b})";
            $set = function (string $name, string $value) use (&$vars, $mode) {
                $vars[] = "--site-{$mode}-{$name}:{$value}";
            };

            foreach (self::KEYS as $key) {
                if ($changed($key)) {
                    $set($key, $c[$key]);
                }
            }

            if ($changed('primary')) {
                $set('primary-deep', $mix($c['primary'], 80, '#000000'));
            }
            if ($changed('secondary')) {
                // Survol des liens : plus foncé en clair, plus clair en sombre.
                $set('secondary-deep', $mode === 'light' ? $mix($c['secondary'], 80, '#000000') : $mix($c['secondary'], 70, '#ffffff'));
            }
            $tint = $mode === 'light' ? 'primary' : 'secondary';
            if ($changed('accent', $tint)) {
                $set('accent-2', $mix($c['accent'], 88, $c[$tint]));
                $set('accent-3', $mix($c['accent'], 72, $c[$tint]));
                $set('accent-4', $mix($c['accent'], 52, $c[$tint]));
            }
            if ($changed('background', 'foreground')) {
                $set('paper', $c['background']);
                $set('paper-dim', $mix($c['background'], 92, $c['foreground']));
            }
            if ($changed('surface', 'foreground')) {
                $set('surface-2', $mix($c['surface'], 97, $c['foreground']));
                $set('surface-3', $mix($c['surface'], 93, $c['foreground']));
                $set('fg-soft', $mix($c['foreground'], 85, $c['surface']));
                $set('fg-muted', $mix($c['foreground'], 62, $c['surface']));
                // 55 % (et non 45) : au moins 3:1 sur la surface, seuil WCAG des icônes.
                $set('fg-subtle', $mix($c['foreground'], 55, $c['surface']));
            }
            if ($changed('border', 'foreground')) {
                $set('border-strong', $mix($c['border'], 75, $c['foreground']));
            }
        }

        return $vars ? ':root{'.implode(';', $vars).'}' : '';
    }
}
