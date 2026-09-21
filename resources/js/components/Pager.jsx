// Pagination des listes d'administration : le serveur envoie 20 lignes par page (`current_page`, `last_page`, `total`).
export default function Pager({ meta, onChange }) {
    if (!meta || meta.last_page <= 1) return null;

    return (
        <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
                type="button"
                className="btn-secondary"
                disabled={meta.current_page <= 1}
                onClick={() => onChange(meta.current_page - 1)}
            >
                Précédent
            </button>
            <span className="text-sm text-ink-soft">
                Page {meta.current_page} / {meta.last_page} · {meta.total} éléments
            </span>
            <button
                type="button"
                className="btn-secondary"
                disabled={meta.current_page >= meta.last_page}
                onClick={() => onChange(meta.current_page + 1)}
            >
                Suivant
            </button>
        </nav>
    );
}
