// Espaces avec barre latérale fixe (placée sous l'en-tête) : tableaux de bord, profil,
// messages… L'en-tête y reste sur toute la largeur (aligné sur la barre latérale) ; ailleurs
// son contenu est centré comme le reste de la page (charte UMG).
const WORKSPACE_PREFIXES = [
    "/tableau-de-bord", "/notifications", "/messages", "/mes-", "/espace-recherche",
    "/veille-scientifique", "/avis-suggestions", "/signaler-un-probleme", "/profil",
    "/bibliothecaire", "/administrateur", "/apercu-theme",
];

export function isWorkspacePath(pathname) {
    return WORKSPACE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
