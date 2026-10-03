import { Eye } from "lucide-react";

// Bouton « Voir » (icône d'œil) partagé par les listes : Bibliothèques, Bibliothécaires, Utilisateurs et
// Demandes de compte. La fiche ouverte est ProfileDetailModal.
export function ViewButton({ onClick, label = "Voir" }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-brass-deep"
        >
            <Eye className="h-4 w-4" />
        </button>
    );
}
