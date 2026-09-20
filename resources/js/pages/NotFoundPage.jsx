import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";

// Affichée pour toute adresse inconnue (au lieu d'une page blanche).
export default function NotFoundPage() {
    return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
            <SearchX className="mx-auto mb-4 h-10 w-10 text-slate-400" strokeWidth={1.5} />
            <h1 className="font-display text-2xl font-extrabold">Page introuvable</h1>
            <p className="mt-2 text-sm text-slate-500">
                Cette adresse n'existe pas ou n'est plus disponible.
            </p>
            <Link to="/" className="btn-primary mt-6">
                Retour à l'accueil
            </Link>
        </div>
    );
}
