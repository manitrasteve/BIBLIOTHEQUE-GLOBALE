import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, ArrowRight } from "lucide-react";
import { api } from "../lib/api";

export default function MyConsultationsPage() {
    const [rows, setRows] = useState(null);

    useEffect(() => {
        api.getMyConsultations()
            .then((r) => setRows(r.data || []))
            .catch(() => setRows([]));
    }, []);

    return (
        <div>
            <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-extrabold">
                <Eye className="h-5 w-5 text-brass" /> Mes consultations
            </h2>

            {rows === null ? (
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
        </div>
    );
}
