// Couverture de remplacement (document sans image) : une couleur pleine par document, toujours la
// même pour un document donné (calculée à partir de son identifiant), au lieu d'un bleu unique.
// Couleurs foncées : le texte et les icônes blancs y restent lisibles (contraste ≥ 4,5:1).
const PALETTE = [
    { bg: "#1a1a8c", spine: "#11116f" }, // bleu nuit
    { bg: "#7f1d3a", spine: "#5e1229" }, // bordeaux
    { bg: "#1d6b4f", spine: "#134a36" }, // vert forêt
    { bg: "#0e5a70", spine: "#093f4f" }, // bleu pétrole
    { bg: "#5a2a82", spine: "#3f1c5c" }, // prune
    { bg: "#9a3b20", spine: "#6e2915" }, // brique
    { bg: "#8a5a0c", spine: "#5f3e07" }, // ocre
    { bg: "#384656", spine: "#262f3b" }, // ardoise
];

/** Texte secondaire posé sur ces couleurs (plein, sans transparence). */
export const COVER_SOFT_TEXT = "#e4e4ee";

export function coverColor(document) {
    const key = String(document?.slug ?? document?.id ?? document?.title ?? "");
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
}
