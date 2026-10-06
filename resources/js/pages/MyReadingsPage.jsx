import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, Search, PlayCircle } from "lucide-react";
import { api } from "../lib/api";
import { usePageRefresh } from "../context/RefreshContext";
import { sessionMemory } from "../lib/sessionMemory";
import { matchesSearch } from "../lib/search";

function formatDate(value) {
    if (!value) return "";
    return new Date(String(value).replace(" ", "T")).toLocaleString("fr-FR");
}

// Dernière page connue : celle de la session en cours si le document vient d'être lu,
// sinon celle enregistrée sur le serveur (conservée d'un appareil / d'une visite à l'autre).
function lastPosition(row) {
    const sessionPage = sessionMemory.getReaderPage(row.slug);
    const page = Number.isInteger(sessionPage) ? sessionPage : row.last_page;
    if (!page) return null;
    const total = sessionMemory.getReaderTotal(row.slug) || row.total_pages || null;
    return { page, total, percent: total ? Math.min(100, Math.round((page / total) * 100)) : null };
}

export default function MyReadingsPage() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    useEffect(() => {
        let active = true;
        setResult(null);
        setError(null);
        api.getMyReadings({ page })
            .then((res) => active && setResult(res))
            .catch(() => {
                if (!active) return;
                setError("Impossible de charger vos lectures.");
                setResult({ data: [] });
            });
        return () => {
            active = false;
        };
    }, [page]);
    usePageRefresh(() => api.getMyReadings({ page }).then((res) => { setResult(res); setError(null); }));

    const rows = useMemo(() => {
        return (result?.data || []).filter((row) =>
            matchesSearch(`${row.title} ${(row.authors || []).join(" ")}`, search),
        );
    }, [result, search]);

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-brass" />
                <h2 className="font-display text-xl font-extrabold">Mes lectures</h2>
            </div>

            <div className="relative mb-5 max-w-[600px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer par titre ou auteur…"
                    aria-label="Filtrer mes lectures"
                    className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm"
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
                        ? "Aucune lecture ne correspond à votre recherche."
                        : "Vous n'avez encore lu aucun document."}
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => {
                        const position = lastPosition(row);

                        return (
                            <div
                                key={row.document_id}
                                className="modern-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                            >
                                <div className="min-w-0">
                                    <p className="break-words font-bold text-slate-900">{row.title}</p>
                                    {row.authors?.length > 0 && (
                                        <p className="text-sm text-slate-600">{row.authors.join(", ")}</p>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">
                                        Dernière consultation : {formatDate(row.last_consulted_at)}
                                        {row.views > 1 ? ` · ${row.views} consultations` : ""}
                                    </p>
                                    {position && (
                                        <div className="mt-2 max-w-xs">
                                            <p className="text-xs font-semibold text-brass">
                                                Page {position.page}
                                                {position.total ? ` sur ${position.total}` : ""}
                                                {position.percent !== null ? ` · ${position.percent} %` : ""}
                                            </p>
                                            {position.percent !== null && (
                                                <div
                                                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"
                                                    role="progressbar"
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-valuenow={position.percent}
                                                    aria-label={`Progression de lecture de ${row.title}`}
                                                >
                                                    <div className="h-full rounded-full bg-indigo-600" style={{ width: `${position.percent}%` }} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <Link
                                    to={`/documents/${row.slug}`}
                                    className="btn-primary shrink-0 justify-center"
                                >
                                    <PlayCircle className="h-4 w-4" aria-hidden="true" />
                                    {position?.page > 1 ? `Reprendre à la page ${position.page}` : "Reprendre la lecture"}
                                </Link>
                            </div>
                        );
                    })}
                </div>
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
