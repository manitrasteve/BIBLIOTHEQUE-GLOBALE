import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, Search, PlayCircle } from "lucide-react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";
import { matchesSearch } from "../lib/search";

function formatDate(value) {
    if (!value) return "";
    return new Date(String(value).replace(" ", "T")).toLocaleString("fr-FR");
}

// Dernière page connue : uniquement la mémoire temporaire du lecteur (session en cours).
function lastPosition(slug) {
    const page = sessionMemory.getReaderPage(slug);
    if (!Number.isInteger(page)) return null;
    const total = sessionMemory.getReaderTotal(slug);
    return total ? `Page ${page} / ${total}` : `Page ${page}`;
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

    const rows = useMemo(() => {
        return (result?.data || []).filter((row) =>
            matchesSearch(`${row.title} ${(row.authors || []).join(" ")}`, search),
        );
    }, [result, search]);

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-indigo-600" />
                <h2 className="font-display text-xl font-extrabold">Mes lectures</h2>
            </div>

            <div className="relative mb-5 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer par titre ou auteur…"
                    aria-label="Filtrer mes lectures"
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
                        ? "Aucune lecture ne correspond à votre recherche."
                        : "Vous n'avez encore lu aucun document."}
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => {
                        const position = lastPosition(row.slug);

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
                                        <p className="mt-1 text-xs font-semibold text-indigo-600">
                                            Dernière page consultée : {position}
                                        </p>
                                    )}
                                </div>
                                <Link
                                    to={`/documents/${row.slug}`}
                                    className="btn-primary shrink-0 justify-center"
                                >
                                    <PlayCircle className="h-4 w-4" />
                                    Reprendre la lecture
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
