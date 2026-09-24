import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    CheckCircle2,
    XCircle,
    ShieldCheck,
    Ticket,
    Clock3,
    RefreshCw,
} from "lucide-react";

import { api } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { sortRows } from "../../lib/sort";
import StatusBadge from "../../components/StatusBadge";
import DetailModal, { ViewButton } from "../../components/DetailModal";
import SortTh from "../../components/SortTh";
import { requestSections } from "../../lib/detailSections";
import { useAuth } from "../../context/AuthContext";
import CounterBar from "../../components/CounterBar";
import Pager from "../../components/Pager";

const FILTERS = [
    "en_attente",
    "verifiee",
    "validee",
    "compte_active",
    "rejetee",
    "expiree",
];

function getRequestVal(row, key) {
    if (key === "name") return `${row.first_name || ""} ${row.last_name || ""}`;
    if (key === "reference") return row.request_number;
    return row[key];
}

function isSetupLinkExpired(r) {
    return !!r.setup_expires_at && new Date(r.setup_expires_at) < new Date();
}

const LABELS = {
    en_attente: "Non validé",
    verifiee: "Vérifiée",
    validee: "En attente",
    compte_active: "Compte activé",
    rejetee: "Rejetée",
    expiree: "Expirée",
};

export default function AccountRequestsPage() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    const [rows, setRows] = useState(null);
    // Compteurs du périmètre autorisé (mêmes demandes que la liste, tous statuts confondus).
    const [counts, setCounts] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [viewing, setViewing] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [sort, setSort] = useState({ key: null, dir: "asc" });
    const matchRow = (r) =>
        matchesSearch(
            `${r.first_name} ${r.last_name} ${r.email} ${r.request_number} ${r.matricule || ""}`,
            query,
        );
    const visibleRows = rows ? sortRows(rows.filter(matchRow), sort, getRequestVal) : [];

    const [filter, setFilter] = useState(() => {
        const fromUrl = searchParams.get("status");

        if (fromUrl && FILTERS.includes(fromUrl)) {
            return fromUrl;
        }

        return user?.role === "administrateur" ? "verifiee" : "en_attente";
    });

    // Le serveur pagine (20 par page) : on garde la page courante pour qu'une action ne renvoie pas au début.
    const [meta, setMeta] = useState(null);

    async function load(page = meta?.current_page || 1) {
        try {
            setError(null);
            setRows(null);

            const response = await api.getAccountRequests({
                status: filter,
                page,
            });

            // Dernier élément d'une page retiré (rejet, validation) : on revient à la page précédente.
            if (!(response.data || []).length && page > 1) {
                return load(page - 1);
            }

            setRows(response.data || []);
            setCounts(response.counts || null);
            setMeta({ current_page: response.current_page, last_page: response.last_page, total: response.total });
        } catch (e) {
            setError(e.data?.message || "Impossible de charger les demandes.");
            setRows([]);
        }
    }

    useEffect(() => {
        load(1); // changement de filtre : première page
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

    async function resendLink(id) {
        if (busyId) return;
        setBusyId(id);
        try {
            setError(null);

            await api.resendSetupLink(id);

            await load();
        } catch (e) {
            setError(e.data?.message || "Envoi impossible.");
        } finally {
            setBusyId(null);
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

    function renderActions(r) {
        return (
            <>
                <ViewButton onClick={() => setViewing(r)} />
                {r.status === "en_attente" && (
                    <>
                        <button
                            onClick={() => verify(r.id)}
                            disabled={busyId !== null}
                            className="btn-secondary disabled:opacity-50"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {busyId === r.id ? "Vérification…" : "Vérifier"}
                        </button>
                        <button
                            onClick={() => reject(r.id)}
                            className="text-sm font-bold text-rose-700"
                        >
                            <XCircle className="mr-1 inline h-4 w-4" />
                            Rejeter
                        </button>
                    </>
                )}
                {user?.role === "administrateur" && r.status === "verifiee" && (
                    <>
                        <button
                            onClick={() => validate(r.id)}
                            disabled={busyId !== null}
                            className="btn-primary disabled:opacity-50"
                        >
                            <ShieldCheck className="h-4 w-4" />
                            {busyId === r.id ? "Validation…" : "Valider"}
                        </button>
                        <button
                            onClick={() => reject(r.id)}
                            className="text-sm font-bold text-rose-700"
                        >
                            <XCircle className="mr-1 inline h-4 w-4" />
                            Rejeter
                        </button>
                    </>
                )}
                {r.status === "validee" && filter === "compte_active" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Compte activé
                    </span>
                ) : r.status === "validee" && isSetupLinkExpired(r) ? (
                    <>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                            <Clock3 className="h-4 w-4" />
                            Lien expiré
                        </span>
                        <button
                            onClick={() => resendLink(r.id)}
                            disabled={busyId !== null}
                            className="btn-secondary disabled:opacity-50"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {busyId === r.id ? "Envoi…" : "Renvoyer le lien"}
                        </button>
                    </>
                ) : r.status === "validee" && (
                    <>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <Clock3 className="h-4 w-4" />
                            Lien envoyé
                        </span>
                        <button
                            onClick={() => resendLink(r.id)}
                            disabled={busyId !== null}
                            title="Renvoyer le lien de création du mot de passe"
                            aria-label="Renvoyer le lien de création du mot de passe"
                            className="btn-secondary !px-2.5 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${busyId === r.id ? "animate-spin" : ""}`} />
                        </button>
                    </>
                )}
            </>
        );
    }

    return (
        <div>
            {/* En-tête */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <Ticket className="h-5 w-5 text-brass" />
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
                    className="min-w-0 w-full sm:max-w-[600px] sm:flex-1 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm"
                />
                <button className="btn-primary w-full sm:w-auto sm:shrink-0">
                    <Ticket className="h-4 w-4" /> Rechercher
                </button>
            </form>

            <CounterBar
                total={counts?.total}
                items={counts?.traitee > 0 ? [{ label: "Traitées", value: counts.traitee }] : []}
            />

            {/* Filtres */}
            <div className="mb-6 flex flex-wrap gap-2">
                {FILTERS.map((key) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                            filter === key
                                ? "border-ink bg-ink text-paper"
                                : "border-slate-200 bg-surface text-slate-600 hover:border-indigo-300 hover:text-brass-deep"
                        }`}
                    >
                        {LABELS[key]}
                        {counts && <span className="ml-1.5 font-semibold">({counts[key] ?? 0})</span>}
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
                <>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-surface sm:block">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <SortTh label="Demandeur" sortKey="name" sort={sort} setSort={setSort} />
                                <SortTh label="Référence" sortKey="reference" sort={sort} setSort={setSort} />
                                <SortTh label="Rôle" sortKey="role" sort={sort} setSort={setSort} />
                                <SortTh label="Statut" sortKey="status" sort={sort} setSort={setSort} />
                                <th className="px-4 py-3 text-right">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan="5"
                                        className="p-5 text-center text-slate-500"
                                    >
                                        Aucun résultat.
                                    </td>
                                </tr>
                            )}
                            {visibleRows
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
                                                {renderActions(r)}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
                <div className="space-y-3 sm:hidden">
                    {visibleRows.length === 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-surface p-5 text-center text-slate-500">
                            Aucun résultat.
                        </div>
                    )}
                    {visibleRows.map((r) => (
                        <div key={r.id} className="rounded-2xl border border-slate-200 bg-surface p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold break-words">{r.first_name} {r.last_name}</p>
                                    <p className="text-xs text-slate-500 break-words">{r.email} · {r.phone}</p>
                                </div>
                                <StatusBadge status={r.status} label={LABELS[r.status] || r.status} />
                            </div>
                            <p className="mt-2 font-mono text-xs text-slate-500 break-words">
                                {r.request_number}
                                <br />
                                Numéro de compte : {r.matricule || "—"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                Rôle : {{ etudiant: "Étudiant", enseignant: "Enseignant", chercheur: "Chercheur" }[r.role] || r.role || "—"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {renderActions(r)}
                            </div>
                        </div>
                    ))}
                </div>
                </>
            )}

            <Pager meta={meta} onChange={(p) => load(p)} />

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
