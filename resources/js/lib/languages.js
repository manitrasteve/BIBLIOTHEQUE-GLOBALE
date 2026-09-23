// Langues des documents : codes enregistrés (les anciens documents peuvent contenir le libellé).
export const LANGUAGES = [
    { value: "fr", label: "Français" },
    { value: "mg", label: "Malgache" },
    { value: "en", label: "Anglais" },
    { value: "es", label: "Espagnol" },
    { value: "pt", label: "Portugais" },
    { value: "it", label: "Italien" },
    { value: "ru", label: "Russe" },
    { value: "autre", label: "Autre" },
];

// Code (« mg ») ou libellé saisi librement (« malgache ») → libellé propre (« Malgache »).
const LABELS = Object.fromEntries(
    LANGUAGES.flatMap((l) => [
        [l.value, l.label],
        [l.label.toLowerCase(), l.label],
    ]),
);

export function languageLabel(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    return LABELS[text.toLowerCase()] || text.charAt(0).toUpperCase() + text.slice(1);
}
