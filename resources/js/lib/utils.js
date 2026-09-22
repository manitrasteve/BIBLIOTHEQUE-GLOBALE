/**
 * Small utility used by the local shadcn/ui components.
 * Kept dependency-free so the existing application does not need a
 * second class-merging library just for the UI layer.
 */
export function cn(...classes) {
 return classes
 .flat(Infinity)
 .filter((value) => typeof value === "string" && value.trim())
 .join(" ");
}

// Extrait le texte brut d'un champ HTML (ex: résumé saisi via RichTextEditor) pour un aperçu court.
// Ne pas utiliser pour un affichage riche : le résultat est un texte simple, sans mise en forme.
export function stripHtml(html) {
 if (!html) return "";
 return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
