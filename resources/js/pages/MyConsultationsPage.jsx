import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { usePageRefresh } from "../context/RefreshContext";

export default function MyConsultationsPage() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        let active = true;
        setResult(null);
        setError(null);
        api.getMyConsultations({ page })
            .then((res) => active && setResult(res))
            .catch(() => {
                if (!active) return;
                setError("Impossible de charger vos consultations.");
                setResult({ data: [] });
            });
        return () => {
            active = false;
        };
    }, [page]);
    usePageRefresh(() => api.getMyConsultations({ page }).then((res) => { setResult(res); setError(null); }));

    const rows = result?.data || [];

    return (
        <div>
            <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-extrabold">
                <Eye className="h-5 w-5 text-brass" /> Mes consultations
            </h2>

            {error && (
                <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            )}

            {result === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : rows.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucune consultation pour l'instant.
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((c) => (
                        <Link
                            key={c.id}
                            to={`/documents/${c.document?.slug}`}
                            className="modern-card flex items-center justify-between gap-4 p-5 hover:border-indigo-300"
                        >
                            <div>
                                <p className="font-bold text-slate-900">
                                    {c.document?.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {c.document?.type}{" "}
                                    {c.document?.year
                                        ? `· ${c.document.year}`
                                        : ""}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Consulté le{" "}
                                    {new Date(c.consulted_at).toLocaleString(
                                        "fr-FR",
                                    )}
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </Link>
                    ))}
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
