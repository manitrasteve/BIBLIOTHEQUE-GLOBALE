import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

/**
 * État vide réutilisable : une icône, un titre, une explication et un appel à l'action
 * facultatif. À utiliser partout où une liste peut être vide, plutôt qu'un simple « Aucun… ».
 *
 * Props :
 *  - icon : composant d'icône lucide (défaut : Inbox)
 *  - title : titre court
 *  - description : phrase d'explication (facultative)
 *  - actionTo / actionLabel : lien d'action interne (facultatif)
 *  - onAction / actionLabel : bouton d'action (si pas de lien)
 *  - children : contenu libre sous la description (facultatif)
 */
export default function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    actionTo,
    actionLabel,
    onAction,
    children,
}) {
    return (
        <div className="modern-card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper-dim text-brass">
                <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {description && <p className="max-w-sm text-sm text-ink-soft">{description}</p>}
            {children}
            {actionLabel && actionTo && (
                <Link to={actionTo} className="btn-primary mt-1">
                    {actionLabel}
                </Link>
            )}
            {actionLabel && !actionTo && onAction && (
                <button type="button" className="btn-primary mt-1" onClick={onAction}>
                    {actionLabel}
                </button>
            )}
        </div>
    );
}
