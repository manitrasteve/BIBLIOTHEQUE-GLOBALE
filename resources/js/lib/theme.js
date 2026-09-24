// Paramètres → Apparence du site : rôles de couleur (mêmes clés que app/Support/ThemePalette.php).
export const THEME_KEYS = [
    { key: "primary", label: "Couleur principale", hint: "Boutons, menu actif, bandeaux d'en-tête" },
    { key: "secondary", label: "Couleur secondaire", hint: "Liens, titres de section, texte de marque" },
    { key: "accent", label: "Couleur d'accent", hint: "Fonds teintés : survols, puces, éléments sélectionnés" },
    { key: "background", label: "Couleur de fond", hint: "Arrière-plan des pages" },
    { key: "surface", label: "Cartes et panneaux", hint: "Fond des cartes, formulaires, menus, tableaux" },
    { key: "foreground", label: "Couleur du texte", hint: "Texte principal ; le texte secondaire en est dérivé" },
    { key: "border", label: "Couleur des bordures", hint: "Contours des cartes, champs et séparateurs" },
];

export const THEME_MODES = [
    { mode: "light", label: "Mode clair" },
    { mode: "dark", label: "Mode sombre" },
];

// Messages entre l'éditeur et l'aperçu (iframe ou onglet, même origine).
export const THEME_PREVIEW_MESSAGE = "bm-theme-preview";
export const THEME_PREVIEW_READY = "bm-theme-preview-ready";
export const THEME_PREVIEW_STORAGE = "bm_theme_preview"; // aperçu plein écran (onglet séparé)

export const isHex = (value) => /^#[0-9a-fA-F]{6}$/.test(value || "");

// Contraste WCAG 2.1 entre deux couleurs HEX (1 à 21).
function luminance(hex) {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
    if (!isHex(a) || !isHex(b)) return null;
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}

/**
 * Avertissements d'accessibilité (sans bloquer) : texte courant sous 4,5:1 (WCAG AA).
 */
export function contrastWarnings(colors) {
    const checks = [
        ["foreground", "background", "Texte sur le fond des pages"],
        ["foreground", "surface", "Texte sur les cartes"],
        ["#ffffff", "primary", "Texte blanc des boutons sur la couleur principale"],
        ["secondary", "surface", "Liens (couleur secondaire) sur les cartes"],
    ];
    return checks
        .map(([a, b, label]) => {
            const ratio = contrast(colors[a] || a, colors[b] || b);
            return ratio !== null && ratio < 4.5 ? { label, ratio } : null;
        })
        .filter(Boolean);
}
