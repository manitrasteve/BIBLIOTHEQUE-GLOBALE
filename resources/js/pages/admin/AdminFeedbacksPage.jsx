import { useEffect, useState } from "react";
import { MessageSquare, LifeBuoy, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

function Inbox({ kind }) {
    // Consultation seule pour le bibliothécaire : répondre / supprimer restent réservés à l'administrateur.
    const { user } = useAuth();
    const isAdmin = user?.role === "administrateur";
    const [rows, setRows] = useState(null);
    const isFeedback = kind === "feedback";

    function load() {
        (isFeedback ? api.getFeedbacks() : api.getProblemReports())
            .then((r) => setRows(r.data || []))
            .catch(() => {});
    }

    useEffect(() => {
        load();
    }, [kind]);

    async function reply(row) {
        const text = prompt("Votre réponse :");
        if (!text) return;
        try {
            if (isFeedback)
                await api.replyFeedback(row.id, {
                    reply: text,
                    status: "traite",
                });
            else
                await api.replyProblemReport(row.id, {
                    reply: text,
                    status: "traite",
                });
            setRows((x) =>
                x.map((r) =>
                    r.id === row.id
                        ? { ...r, admin_reply: text, status: "traite" }
                        : r,
                ),
            );
        } catch {}
    }

    async function removeOne(row) {
        if (
            !confirm(
                isFeedback
                    ? "Supprimer cet avis ?"
                    : "Supprimer ce signalement ?",
            )
        )
            return;
        try {
            if (isFeedback) await api.deleteFeedback(row.id);
            else await api.deleteProblemReport(row.id);
            setRows((x) => x.filter((r) => r.id !== row.id));
        } catch {}
    }

    async function clearAll() {
        if (!rows?.length) return;
        const label = isFeedback ? "tous les avis" : "tous les signalements";
        if (
            !confirm(
                `Effacer définitivement ${label} ? Cette action est irréversible.`,
            )
        )
            return;
        try {
            if (isFeedback) await api.clearFeedbacks();
            else await api.clearProblemReports();
            setRows([]);
        } catch {}
    }

    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-6">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    {isFeedback ? (
                        <MessageSquare className="h-5 w-5 text-indigo-600" />
                    ) : (
                        <LifeBuoy className="h-5 w-5 text-indigo-600" />
                    )}
                    {isFeedback ? "Avis des utilisateurs" : "Signalements"}
                </h2>
                {isAdmin && !!rows?.length && (
                    <button
                        onClick={clearAll}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Effacer tout l'historique
                    </button>
                )}
            </div>

            {rows?.length ? (
                rows.map((r) => (
                    <div key={r.id} className="modern-card p-5 mb-3">
                        <div className="flex justify-between gap-4">
                            <div>
                                <p className="font-bold">{r.subject}</p>
                                <p className="text-xs text-slate-500">
                                    {r.user?.name} ·{" "}
                                    {new Date(r.created_at).toLocaleString(
                                        "fr-FR",
                                    )}
                                </p>
                                <p className="mt-3 text-sm text-slate-600">
                                    {r.message || r.description}
                                </p>
                                {r.rating && (
                                    <p className="mt-2">
                                        {"★".repeat(r.rating)}
                                        {"☆".repeat(5 - r.rating)}
                                    </p>
                                )}
                                {r.admin_reply && (
                                    <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                                        <b>Réponse :</b> {r.admin_reply}
                                    </p>
                                )}
                            </div>
                            {isAdmin && <div className="flex h-fit shrink-0 items-center gap-2">
                                <button
                                    onClick={() => reply(r)}
                                    className="btn-secondary"
                                >
                                    Répondre
                                </button>
                                <button
                                    onClick={() => removeOne(r)}
                                    title="Supprimer"
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>}
                        </div>
                    </div>
                ))
            ) : rows ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucun élément.
                </div>
            ) : (
                <p>Chargement…</p>
            )}
        </div>
    );
}

export function AdminFeedbacksPage() {
    return <Inbox kind="feedback" />;
}
export function AdminReportsPage() {
    return <Inbox kind="report" />;
}
