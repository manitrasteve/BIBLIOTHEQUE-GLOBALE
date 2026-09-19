import { Building2 } from "lucide-react";

// Photo de couverture d'une bibliothèque : proportionnée (16/9), jamais déformée,
// sans débordement. Les anciennes bibliothèques sans photo affichent un espace réservé.
export default function LibraryCover({ library, className = "" }) {
    return (
        <div
            className={`relative aspect-video w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}
        >
            {library?.cover_url ? (
                <img
                    key={`${library.id}-${library.cover_url}`}
                    src={library.cover_url}
                    alt={`Photo de couverture de ${library.name}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                    <Building2 className="h-8 w-8" strokeWidth={1.5} />
                    <span className="text-xs font-medium">Aucune photo de couverture</span>
                </div>
            )}
        </div>
    );
}
