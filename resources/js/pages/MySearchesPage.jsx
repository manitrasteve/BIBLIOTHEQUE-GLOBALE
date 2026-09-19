import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, Search, Trash2, RotateCw } from "lucide-react";
import { api } from "../lib/api";
import { matchesSearch } from "../lib/search";

const FILTER_LABELS = {
    author: "Auteur",
    category_id: "Domaine",
    type: "Type",
    year: "Année",
    library_id: "Bibliothèque",
    language: "Langue",
};

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("fr-FR");
}

export default function MySearchesPage() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [names, setNames] = useState({ category_id: {}, library_id: {} });

    useEffect(() => {
        const toMap = (list) =>
            Object.fromEntries((Array.isArray(list) ? list : list?.data || []).map((i) => [String(i.id), i.name]));
        Promise.all([api.getCategories(), api.getLibraries()])
            .then(([categories, libraries]) =>
                setNames({ category_id: toMap(categories), library_id: toMap(libraries) }),
            )
            .catch(() => {});
    }, []);

    function load() {
        setError(null);
        return api
            .getMySearches({ page })
            .then(setResult)
            .catch(() => {
                setError("Impossible de charger vos recherches.");
                setResult({ data: [] });
            });
    }

    useEffect(() => {
        setResult(null);
        load();
    }, [page]);

    async function remove(id) {
        try {
            await api.deleteSearch(id);
            await load();
        } catch {
            setError("Impossible de supprimer cette recherche.");
        }
    }

    async function clearAll() {
        if (!confirm("Effacer tout l'historique de vos recherches ?")) return;
        try {
            await api.clearSearches();
            setPage(1);
            await load();
        } catch {
            setError("Impossible d'effacer l'historique.");
        }
    }

    const rows = useMemo(
        () => (result?.data || []).filter((row) => matchesSearch(row.query, search)),
        [result, search],
    );

    function resumeUrl(row) {
        const params = new URLSearchParams({ q: row.query, ...(row.filters || {}) });
        return `/espace-recherche?${params.toString()}`;
    }

    function filterText(key, value) {
        return `${FILTER_LABELS[key] || key} : ${names[key]?.[String(value)] || value}`;
    }

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-indigo-600" />
                    <h2 className="font-display text-xl font-extrabold">Mes recherches</h2>
                </div>
                {(result?.data?.length || 0) > 0 && (
                    <button type="button" onClick={clearAll} className="btn-secondary">
                        <Trash2 className="h-4 w-4" />
                        Tout effacer
                    </button>
                )}
            </div>

            <div className="relative mb-5 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer mes recherches…"
                    aria-label="Filtrer mes recherches"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
                />
            </div>

            {error && (
                <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            )}

            {result === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : rows.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    {search
                        ? "Aucune recherche ne correspond à votre saisie."
                        : "Aucune recherche enregistrée. Validez une recherche dans l'Espace recherche pour la retrouver ici."}
                </div>
            ) : (
                <ul className="space-y-3">
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            className="modern-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                        >
                            <div className="min-w-0">
                                <p className="break-words font-bold text-slate-900">{row.query}</p>
                                {row.filters && Object.keys(row.filters).length > 0 && (
                                    <p className="mt-1 flex flex-wrap gap-1.5">
                                        {Object.entries(row.filters).map(([key, value]) => (
                                            <span
                                                key={key}
                                                className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
                                            >
                                                {filterText(key, value)}
                                            </span>
                                        ))}
                                    </p>
                                )}
                                <p className="mt-1 text-xs text-slate-500">{formatDate(row.updated_at)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Link to={resumeUrl(row)} className="btn-primary justify-center">
                                    <RotateCw className="h-4 w-4" />
                                    Reprendre la recherche
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => remove(row.id)}
                                    className="btn-secondary !px-3"
                                    aria-label="Supprimer cette recherche"
                                    title="Supprimer"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {result?.last_page > 1 && (
                <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        Précédent
                    </button>
                    <span className="text-sm text-slate-500">
                        Page {result.current_page} / {result.last_page}
                    </span>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={page >= result.last_page}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Suivant
                    </button>
                </div>
            )}
        </div>
    );
}
