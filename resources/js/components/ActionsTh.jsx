import { ChevronDown } from "lucide-react";

// En-tête « Actions » cliquable : les boutons d'action des lignes sont cachés au départ ;
// un clic les affiche, un nouveau clic les cache. `open` / `onToggle` sont détenus par la page
// (un état par tableau).
export default function ActionsTh({ open, onToggle, align = "right" }) {
    return (
        <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                title={open ? "Masquer les actions" : "Afficher les actions"}
                className="inline-flex items-center gap-1 uppercase hover:text-brass focus-visible:text-brass"
            >
                Actions
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
        </th>
    );
}
