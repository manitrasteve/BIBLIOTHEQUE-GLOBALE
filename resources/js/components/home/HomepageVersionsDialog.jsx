import { useEffect, useState } from "react";
import { Eye, History, Loader2, RotateCcw, X } from "lucide-react";
import { api } from "../../lib/api";

const formatDate = (value) =>
    value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";

// Historique des versions publiées : consulter (dans l'aperçu) ou restaurer.
export default function HomepageVersionsDialog({ currentVersion, busy, onClose, onView, onRestore }) {
    const [versions, setVersions] = useState([]);
    const [page, setPage] = useState({ current: 0, last: 1 });
    const [loading, setLoading] = useState(false);
    const [opening, setOpening] = useState(null);
    const [error, setError] = useState(null);

    async function load(next) {
        setLoading(true);
        setError(null);
        try {
            const response = await api.getHomepageVersions(next);
            setVersions((list) => (next === 1 ? response.data : [...list, ...response.data]));
            setPage({ current: response.current_page, last: response.last_page });
        } catch (e) {
            setError(e.message || "Chargement impossible.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(1);
        const onKey = (event) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    async function view(version) {
        setOpening(version);
        try {
            onView(await api.getHomepageVersion(version));
        } catch (e) {
            setError(e.message || "Version introuvable.");
        } finally {
            setOpening(null);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label="Historique des versions" className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-surface p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
                        <History className="h-5 w-5 text-brass" /> Historique des versions
                    </h3>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="btn-secondary !px-3 !py-2">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}

                <div className="-mx-1 flex-1 overflow-y-auto px-1">
                    {!loading && versions.length === 0 && !error && (
                        <p className="py-8 text-center text-sm text-slate-500">
                            Aucune version publiée. La page d'accueil affiche son contenu d'origine.
                        </p>
                    )}

                    <ul className="space-y-2">
                        {versions.map((v) => (
                            <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                                        Version {v.version}
                                        {v.version === currentVersion && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">En ligne</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {formatDate(v.published_at)} · Publié par {v.author || "compte supprimé"}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {v.section_count} section{v.section_count > 1 ? "s" : ""}
                                        {v.restored_from && ` · restaurée depuis la version ${v.restored_from}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => view(v.version)} disabled={opening !== null} className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50">
                                        {opening === v.version ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                        Voir
                                    </button>
                                    {v.version !== currentVersion && (
                                        <button type="button" onClick={() => onRestore(v.version)} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50">
                                            <RotateCcw className="h-4 w-4" /> Restaurer
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>

                    {loading && (
                        <p className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                        </p>
                    )}
                    {!loading && page.current < page.last && (
                        <button type="button" onClick={() => load(page.current + 1)} className="mt-3 w-full text-sm font-semibold text-brass">
                            Versions plus anciennes
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
