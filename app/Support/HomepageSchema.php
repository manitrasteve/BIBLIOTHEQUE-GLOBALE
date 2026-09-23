<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Schéma des sections de la page d'accueil : seuls ces types et ces champs sont acceptés.
 * Tout champ absent du schéma est ignoré, aucun HTML/CSS/JS libre n'est stocké.
 * Le frontend (resources/js/lib/homepage.js) doit déclarer les mêmes types et champs.
 *
 * Définition d'un champ : [genre, ...paramètres]
 *   text (max) · bool · int (min, max) · link · image · list (maxItems, maxLength) · cards (maxItems)
 */
class HomepageSchema
{
    public const MAX_SECTIONS = 30;
    public const IMAGE_DIR = 'homepage';

    public const TYPES = [
        'hero' => [
            'badge' => ['text', 120],
            'title' => ['text', 160],
            'highlight' => ['text', 80],
            'description' => ['text', 600],
            'show_search' => ['bool'],
            'features' => ['list', 4, 40],
            'show_image' => ['bool'],
            'image' => ['image'],
            'image_alt' => ['text', 160],
        ],
        'categories' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
        ],
        'documents' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'link_text' => ['text', 60],
            'limit' => ['int', 2, 12],
        ],
        'libraries' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'limit' => ['int', 1, 12],
        ],
        'stats' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'show_documents' => ['bool'],
            'show_libraries' => ['bool'],
            'show_categories' => ['bool'],
        ],
        'text' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'body' => ['text', 5000],
        ],
        'image' => [
            'image' => ['image'],
            'alt' => ['text', 160],
            'caption' => ['text', 300],
        ],
        'cards' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'items' => ['cards', 6],
        ],
        'cta' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'description' => ['text', 600],
            'button_text' => ['text', 60],
            'button_link' => ['link'],
        ],
        'signup' => [
            'label' => ['text', 60],
            'title' => ['text', 160],
            'description' => ['text', 600],
            'button_text' => ['text', 60],
            'button_link' => ['link'],
            'guests_only' => ['bool'],
        ],
    ];

    // Propriétés de style autorisées : valeurs prédéfinies ou couleur #RRGGBB, rien d'autre.
    public const STYLE_CHOICES = [
        'align' => ['left', 'center'],
        'title_size' => ['sm', 'md', 'lg'],
        'title_weight' => ['normal', 'semibold', 'bold', 'extrabold'],
        'spacing' => ['sm', 'md', 'lg'],
    ];

    public const STYLE_COLORS = ['text_color', 'bg_color', 'button_color'];

    /**
     * Valide la liste des sections et la renvoie normalisée (champs inconnus retirés).
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public static function validate(mixed $sections): array
    {
        Validator::make(['sections' => $sections], [
            'sections' => ['present', 'array', 'list', 'max:'.self::MAX_SECTIONS],
            'sections.*' => ['array'],
            'sections.*.id' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/', 'distinct'],
            'sections.*.type' => ['required', 'string', Rule::in(array_keys(self::TYPES))],
            'sections.*.visible' => ['required', 'boolean'],
            'sections.*.content' => ['nullable', 'array'],
            'sections.*.style' => ['nullable', 'array'],
        ], [
            'sections.*.type.in' => 'Type de section inconnu.',
        ])->validate();

        $rules = [];
        foreach ($sections as $i => $section) {
            foreach (self::TYPES[$section['type']] as $field => $definition) {
                $rules += self::fieldRules("sections.$i.content.$field", $definition);
            }
            foreach (self::STYLE_CHOICES as $key => $choices) {
                $rules["sections.$i.style.$key"] = ['nullable', Rule::in($choices)];
            }
            foreach (self::STYLE_COLORS as $key) {
                $rules["sections.$i.style.$key"] = ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'];
            }
        }

        Validator::make(['sections' => $sections], $rules, [
            'regex' => 'Format invalide.',
            'max' => 'Trop long (maximum :max).',
        ])->validate();

        return array_map(fn (array $section) => self::normalize($section), $sections);
    }

    /** Chemins d'images (disque public) utilisés par une liste de sections. */
    public static function imagesIn(array $sections): array
    {
        $paths = [];
        foreach ($sections as $section) {
            foreach (self::TYPES[$section['type'] ?? ''] ?? [] as $field => $definition) {
                if ($definition[0] === 'image' && !empty($section['content'][$field])) {
                    $paths[] = $section['content'][$field];
                }
            }
        }

        return $paths;
    }

    // Lien interne (« /recherche ») ou externe en http(s) ; refuse javascript:, data:, « //hôte »…
    public static function isSafeLink(string $value): bool
    {
        if (preg_match('#^/(?!/)[^\s\\\\]*$#', $value)) {
            return true;
        }

        return (bool) preg_match('#^https?://[^\s]+$#i', $value)
            && filter_var($value, FILTER_VALIDATE_URL) !== false;
    }

    private static function fieldRules(string $key, array $definition): array
    {
        return match ($definition[0]) {
            'text' => [$key => ['nullable', 'string', 'max:'.$definition[1]]],
            'bool' => [$key => ['nullable', 'boolean']],
            'int' => [$key => ['nullable', 'integer', 'min:'.$definition[1], 'max:'.$definition[2]]],
            'link' => [$key => ['nullable', 'string', 'max:500', self::linkRule()]],
            'image' => [$key => ['nullable', 'string', 'max:255', self::imageRule()]],
            'list' => [
                $key => ['nullable', 'array', 'list', 'max:'.$definition[1]],
                "$key.*" => ['nullable', 'string', 'max:'.$definition[2]],
            ],
            'cards' => [
                $key => ['nullable', 'array', 'list', 'max:'.$definition[1]],
                "$key.*" => ['array'],
                "$key.*.title" => ['nullable', 'string', 'max:80'],
                "$key.*.text" => ['nullable', 'string', 'max:300'],
                "$key.*.link" => ['nullable', 'string', 'max:500', self::linkRule()],
            ],
        };
    }

    private static function linkRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if (is_string($value) && $value !== '' && !self::isSafeLink($value)) {
                $fail('Lien invalide : utilisez une adresse interne (/recherche) ou externe (https://…).');
            }
        };
    }

    // Seules les images téléversées via l'éditeur (dossier homepage du disque public) sont acceptées.
    private static function imageRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if (!is_string($value) || $value === '') {
                return;
            }
            if (!preg_match('#^'.self::IMAGE_DIR.'/[A-Za-z0-9._-]+$#', $value) || !Storage::disk('public')->exists($value)) {
                $fail('Image introuvable : téléversez-la de nouveau.');
            }
        };
    }

    private static function normalize(array $section): array
    {
        $content = [];
        foreach (self::TYPES[$section['type']] as $field => $definition) {
            $value = $section['content'][$field] ?? null;
            $content[$field] = match ($definition[0]) {
                'text', 'link' => trim((string) $value),
                'bool' => (bool) $value,
                'int' => $value === null || $value === '' ? null : (int) $value,
                'image' => $value ?: null,
                'list' => array_values(array_filter(array_map(fn ($v) => trim((string) $v), $value ?? []), fn ($v) => $v !== '')),
                'cards' => array_map(fn ($card) => [
                    'title' => trim((string) ($card['title'] ?? '')),
                    'text' => trim((string) ($card['text'] ?? '')),
                    'link' => trim((string) ($card['link'] ?? '')),
                ], $value ?? []),
            };
        }

        $style = [];
        foreach ([...array_keys(self::STYLE_CHOICES), ...self::STYLE_COLORS] as $key) {
            $style[$key] = ($section['style'][$key] ?? null) ?: null;
        }

        return [
            'id' => $section['id'],
            'type' => $section['type'],
            'visible' => (bool) $section['visible'],
            'content' => $content,
            'style' => $style,
        ];
    }
}
