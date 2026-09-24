import { useEffect } from "react";
import { Eye, X } from "lucide-react";

// Bouton « Voir » (icône d'œil) partagé par les listes : Bibliothèques,
// Bibliothécaires, Utilisateurs et Demandes de compte.
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

const isEmpty = (value) => value === null || value === undefined || value === "" || value === false;

// Fenêtre de consultation en lecture seule. `sections` = [{ title, fields: [[libellé, valeur], …] }].
// Les champs sans valeur sont masqués : seules les données réellement enregistrées sont affichées.
export default function DetailModal({ title, subtitle, media, sections, onClose }) {
    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const visible = sections
        .map((section) => ({ ...section, fields: section.fields.filter(([, value]) => !isEmpty(value)) }))
        .filter((section) => section.fields.length > 0);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 p-4"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 text-slate-900 sm:p-4"
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="break-words font-display text-xl font-extrabold">{title}</h3>
                        {subtitle && <p className="mt-1 break-words text-sm text-slate-500">{subtitle}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="btn-secondary !px-3 !py-2">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {media}

                <div className="space-y-6">
                    {visible.map((section) => (
                        <section key={section.title}>
                            <h4 className="mb-3 border-b border-slate-100 pb-2 text-xs font-extrabold uppercase tracking-wide text-brass">
                                {section.title}
                            </h4>
                            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                                {section.fields.map(([label, value]) => (
                                    <div key={label} className="min-w-0">
                                        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                                        <dd className="mt-0.5 break-words text-sm font-medium">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    ))}
                    {visible.length === 0 && <p className="text-sm text-slate-500">Aucune information enregistrée.</p>}
                </div>

                <div className="mt-6 flex justify-end">
                    <button type="button" onClick={onClose} className="btn-secondary">Fermer</button>
                </div>
            </div>
        </div>
    );
}
