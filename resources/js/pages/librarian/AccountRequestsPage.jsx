import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    CheckCircle2,
    XCircle,
    ShieldCheck,
    Ticket,
    Clock3,
} from "lucide-react";

import { api } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import StatusBadge from "../../components/StatusBadge";
import DetailModal, { ViewButton } from "../../components/DetailModal";
import { requestSections } from "../../lib/detailSections";
import { useAuth } from "../../context/AuthContext";

const FILTERS = [
    "en_attente",
    "verifiee",
    "validee",
    "compte_active",
    "rejetee",
    "expiree",
];

const LABELS = {
    en_attente: "En attente",
    verifiee: "Vérifiée",
    validee: "En attente de création du mot de passe",
    compte_active: "Compte activé",
    rejetee: "Rejetée",
    expiree: "Expirée",
};

export default function AccountRequestsPage() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [viewing, setViewing] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const matchRow = (r) =>
        matchesSearch(
            `${r.first_name} ${r.last_name} ${r.email} ${r.request_number} ${r.matricule || ""}`,
            query,
        );

    const [filter, setFilter] = useState(() => {
        const fromUrl = searchParams.get("status");

        if (fromUrl && FILTERS.includes(fromUrl)) {
            return fromUrl;
        }

        return user?.role === "administrateur" ? "verifiee" : "en_attente";
    });

    async function load() {
        try {
            setError(null);
            setRows(null);

            const response = await api.getAccountRequests({
                status: filter,
            });

            setRows(response.data || []);
        } catch (e) {
            setError(e.data?.message || "Impossible de charger les demandes.");
            setRows([]);
        }
    }

    useEffect(() => {
        load();
    }, [filter]);

    async function verify(id) {
        if (busyId) return;
        setBusyId(id);
        try {
            setError(null);

            await api.verifyAccountRequest(id);

            await load();
        } catch (e) {
            setError(e.data?.message || "Vérification impossible.");
        } finally {
            setBusyId(null);
        }
    }

    async function validate(id) {
        if (busyId) return;
        setBusyId(id);
        try {
            setError(null);

            await api.validateAccountRequest(id);

            await load();
        } catch (e) {
            setError(e.data?.message || "Validation impossible.");
        } finally {
            setBusyId(null);
        }
    }

    async function validateAll() {
        if (!confirm("Valider toutes les demandes vérifiées ?")) {
            return;
        }

        try {
            setError(null);

            await api.validateAllAccountRequests();

            await load();
        } catch (e) {
            setError(e.data?.message || "Validation impossible.");
        }
    }

    async function reject(id) {
        const reason = prompt("Motif du rejet (facultatif) :") ?? "";

        try {
            setError(null);

            if (user?.role === "administrateur") {
                await api.adminRejectAccountRequest(id, reason);
            } else {
                await api.rejectAccountRequest(id, reason);
            }

            await load();
        } catch (e) {
            setError(e.data?.message || "Rejet impossible.");
        }
    }

    return (
        <div>
            {/* En-tête */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <Ticket className="h-5 w-5 text-indigo-600" />
                    Demandes de création de compte
                </h2>

                {user?.role === "administrateur" && (
                    <button onClick={validateAll} className="btn-primary">
                        <ShieldCheck className="h-4 w-4" />
                        Valider toutes les demandes vérifiées
                    </button>
                )}
            </div>

            <form
                onSubmit={(e) => e.preventDefault()}
                className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center"
            >
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher nom, e-mail, numéro de demande, numéro de compte…"
                    className="min-w-0 w-full sm:max-w-[600px] sm:flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
                <button className="btn-primary w-full sm:w-auto sm:shrink-0">
                    <Ticket className="h-4 w-4" /> Rechercher
                </button>
            </form>

            {/* Filtres */}
            <div className="mb-6 flex flex-wrap gap-2">
                {FILTERS.map((key) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                            filter === key
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                        }`}
                    >
                        {LABELS[key]}
                    </button>
                ))}
            </div>

            {/* Erreur */}
            {error && (
                <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}

            {/* Contenu */}
            {rows === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : rows.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucune demande dans cette catégorie.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left">
                                    Demandeur
                                </th>
                                <th className="px-4 py-3 text-left">
                                    Référence
                                </th>
                                <th className="px-4 py-3 text-left">Rôle</th>
                                <th className="px-4 py-3 text-left">Statut</th>
                                <th className="px-4 py-3 text-right">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.filter(matchRow).length === 0 && (
                                <tr>
                                    <td
                                        colSpan="5"
                                        className="p-8 text-center text-slate-500"
                                    >
                                        Aucun résultat.
                                    </td>
                                </tr>
                            )}
                            {rows
                                .filter(matchRow)
                                .map((r) => (
                                    <tr
                                        key={r.id}
                                        className="border-t border-slate-100"
                                    >
                                        <td className="px-4 py-3">
                                            <p className="font-semibold">
                                                {r.first_name} {r.last_name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {r.email} · {r.phone}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {r.request_number}
                                            <br />
                                            Numéro de compte : {r.matricule || "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {{
                                                etudiant: "Étudiant",
                                                enseignant: "Enseignant",
                                                chercheur: "Chercheur",
                                            }[r.role] ||
                                                r.role ||
                                                "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge
                                                status={r.status}
                                                label={
                                                    LABELS[r.status] || r.status
                                                }
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end flex-wrap gap-2">
                                                <ViewButton
                                                    onClick={() =>
                                                        setViewing(r)
                                                    }
                                                />
                                                {user?.role ===
                                                    "bibliothecaire" &&
                                                    r.status ===
                                                        "en_attente" && (
                                                        <>
                                                            <button
                                                                onClick={() =>
                                                                    verify(r.id)
                                                                }
                                                                disabled={busyId !== null}
                                                                className="btn-secondary disabled:opacity-50"
                                                            >
                                                                <CheckCircle2 className="h-4 w-4" />
                                                                {busyId === r.id ? "Vérification…" : "Vérifier"}
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    reject(r.id)
                                                                }
                                                                className="text-sm font-bold text-rose-600"
                                                            >
                                                                <XCircle className="mr-1 inline h-4 w-4" />
                                                                Rejeter
                                                            </button>
                                                        </>
                                                    )}
                                                {user?.role ===
                                                    "administrateur" &&
                                                    r.status === "verifiee" && (
                                                        <>
                                                            <button
                                                                onClick={() =>
                                                                    validate(
                                                                        r.id,
                                                                    )
                                                                }
                                                                disabled={busyId !== null}
                                                                className="btn-primary disabled:opacity-50"
                                                            >
                                                                <ShieldCheck className="h-4 w-4" />
                                                                {busyId === r.id ? "Validation…" : "Valider"}
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    reject(r.id)
                                                                }
                                                                className="text-sm font-bold text-rose-600"
                                                            >
                                                                <XCircle className="mr-1 inline h-4 w-4" />
                                                                Rejeter
                                                            </button>
                                                        </>
                                                    )}
                                                {r.status === "validee" && (
                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                                                        <Clock3 className="h-4 w-4" />
                                                        Lien envoyé
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewing && (
                <DetailModal
                    title={`${viewing.first_name || ""} ${viewing.last_name || ""}`.trim()}
                    subtitle={`Demande ${viewing.request_number || ""}`.trim()}
                    sections={requestSections(viewing, LABELS)}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
