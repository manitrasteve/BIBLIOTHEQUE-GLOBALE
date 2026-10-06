import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    CheckCircle2,
    XCircle,
    ShieldCheck,
    Ticket,
    Clock3,
    RefreshCw,
    UserCheck,
    Hourglass,
} from "lucide-react";

import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/search";
import { sortRows } from "../../lib/sort";
import StatusBadge from "../../components/StatusBadge";
import { ViewButton } from "../../components/DetailModal";
import ProfileDetailModal from "../../components/ProfileDetailModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import ExportButton from "../../components/ExportButton";
import SortTh from "../../components/SortTh";
import { ROLES, formatDateTime, requestSections } from "../../lib/detailSections";
import { useAuth } from "../../context/AuthContext";
import StatCard, { StatCardSkeleton } from "../../components/StatCard";
import Pager from "../../components/Pager";
import { usePageRefresh } from "../../context/RefreshContext";

const FILTERS = [
    "en_attente",
    "verifiee",
    "compte_active",
    "rejetee",
    "expiree",
];

// Une demande validée donne un compte actif tout de suite : plus d'onglet « En attente », toutes les demandes
// validées sont dans « Compte activé ». L'administrateur les suit dans « Utilisateurs » (statut, renvoi du lien).
const ADMIN_HIDDEN_FILTERS = ["compte_active"];

// Couleur du badge de statut dans la fiche « Voir ».
const STATUS_TONES = {
    en_attente: "success",
    verifiee: "brand",
    validee: "success",
    rejetee: "danger",
    expiree: "neutral",
};

// Icône et couleur de chaque carte de compteur.
const CARD_STYLES = {
    total: { icon: Ticket },
    en_attente: { icon: Clock3, tone: "success" },
    verifiee: { icon: CheckCircle2 },
    compte_active: { icon: UserCheck, tone: "success" },
    rejetee: { icon: XCircle, tone: "danger" },
    expiree: { icon: Hourglass },
};

function getRequestVal(row, key) {
    if (key === "name") return `${row.first_name || ""} ${row.last_name || ""}`;
    if (key === "reference") return row.request_number;
    return row[key];
}

function isSetupLinkExpired(r) {
    return !!r.setup_expires_at && new Date(r.setup_expires_at) < new Date();
}

const LABELS = {
    en_attente: "En cours",
    verifiee: "Vérifiée",
    validee: "Compte activé",
    compte_active: "Compte activé",
    rejetee: "Rejetée",
    expiree: "Expirée",
};

export default function AccountRequestsPage() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const filters = user?.role === "administrateur"
        ? FILTERS.filter((key) => !ADMIN_HIDDEN_FILTERS.includes(key))
        : FILTERS;

    const [rows, setRows] = useState(null);
    // Compteurs du périmètre autorisé (mêmes demandes que la liste, tous statuts confondus).
    const [counts, setCounts] = useState(null);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null); // confirmation d'un renvoi de lien
    const [query, setQuery] = useState("");
    const [viewing, setViewing] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [sort, setSort] = useState({ key: null, dir: "asc" });
    // Recherche faite par le serveur, sur toutes les pages (et non plus sur la seule page affichée).
    const searchTerm = useDebouncedValue(query.trim(), 350);
    const visibleRows = rows ? sortRows(rows, sort, getRequestVal) : [];

    const [filter, setFilter] = useState(() => {
        const fromUrl = searchParams.get("status");

        if (fromUrl && (fromUrl === "total" || filters.includes(fromUrl))) {
            return fromUrl;
        }

        return user?.role === "administrateur" ? "verifiee" : "en_attente";
    });

    // Le serveur pagine (20 par page) : on garde la page courante pour qu'une action ne renvoie pas au début.
    const [meta, setMeta] = useState(null);

    // « Total » : toutes les catégories affichées en cartes.
    const statusParam = filter === "total" ? filters.join(",") : filter;

    // `refresh` (bouton « Actualiser ») : la liste reste affichée pendant le rechargement et l'échec remonte au bouton.
    async function load(page = meta?.current_page || 1, { refresh = false } = {}) {
        try {
            setError(null);
            if (!refresh) setRows(null);

            const response = await api.getAccountRequests({
                // « Total » : toutes les catégories affichées en cartes.
                status: statusParam,
                ...(searchTerm ? { search: searchTerm } : {}),
                page,
            });

            // Dernier élément d'une page retiré (rejet, validation) : on revient à la page précédente.
            if (!(response.data || []).length && page > 1) {
                return load(page - 1, { refresh });
            }

            setRows(response.data || []);
            setCounts(response.counts || null);
            setMeta({ current_page: response.current_page, last_page: response.last_page, total: response.total });
        } catch (e) {
            setError(e.data?.message || "Impossible de charger les demandes.");
            if (refresh) throw e;
            setRows([]);
        }
    }

    usePageRefresh(() => load(undefined, { refresh: true }));

    useEffect(() => {
        load(1); // changement de filtre ou de recherche : première page
    }, [filter, searchTerm]);

    // Clic sur une carte : la liste n'affiche que cette catégorie, puis on y descend.
    const listRef = useRef(null);
    function selectFilter(key) {
        setFilter((current) => (key === "total" || current === key ? "total" : key));
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

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

    // Sélection multiple (administrateur) : seules les demandes encore à traiter (non validées / vérifiées)
    // peuvent être cochées. La sélection est vidée à chaque rechargement de la liste.
    const isAdmin = user?.role === "administrateur";
    const [selected, setSelected] = useState(() => new Set());
    const [bulk, setBulk] = useState(null); // { action: 'validate' | 'reject', all: bool } : confirmation ouverte
    const [bulkBusy, setBulkBusy] = useState(false);
    // Administrateur : validation / rejet des demandes non validées ou vérifiées ; bibliothécaire : vérification
    // des demandes non validées.
    const isSelectable = (r) => (isAdmin ? ["en_attente", "verifiee"] : ["en_attente"]).includes(r.status);
    const selectableRows = visibleRows.filter(isSelectable);
    const selectedRows = selectableRows.filter((r) => selected.has(r.id));
    const allSelected = selectableRows.length > 0 && selectedRows.length === selectableRows.length;

    // « Sélectionner toutes les demandes » : toutes les pages de la catégorie et de la recherche en cours.
    const [allPages, setAllPages] = useState(false);
    const actionableStatuses = isAdmin ? ["en_attente", "verifiee"] : ["en_attente"];
    const totalSelectable = counts
        ? actionableStatuses
            .filter((status) => filter === "total" || filter === status)
            .reduce((sum, status) => sum + (counts[status] ?? 0), 0)
        : 0;
    const selectedCount = allPages ? totalSelectable : selectedRows.length;

    useEffect(() => {
        setSelected(new Set());
        setAllPages(false);
    }, [rows]);

    function toggleOne(id) {
        setAllPages(false);
        setSelected((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        setAllPages(false);
        setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.id)));
    }

    // « Oui » dans la confirmation : traitement groupé des demandes sélectionnées.
    async function runBulk(reason) {
        // Toutes les pages : le serveur reprend les mêmes filtres que la liste ; sinon, les demandes cochées.
        const target = allPages
            ? { all: true, status: statusParam, ...(searchTerm ? { search: searchTerm } : {}) }
            : { ids: selectedRows.map((r) => r.id) };
        setBulkBusy(true);
        try {
            setError(null);
            setNotice(null);
            const response = bulk.action === "reject"
                ? await api.rejectAllAccountRequests(target, reason)
                : bulk.action === "verify"
                    ? await api.verifyAllAccountRequests(target)
                    : await api.validateAllAccountRequests(target);
            setNotice(response.message);
            setBulk(null);
            await load();
        } catch (e) {
            setError(e.data?.message || ({ reject: "Rejet impossible.", verify: "Vérification impossible." }[bulk.action] ?? "Validation impossible."));
            setBulk(null);
        } finally {
            setBulkBusy(false);
        }
    }

    async function resendLink(id) {
        if (busyId) return;
        setBusyId(id);
        try {
            setError(null);
            setNotice(null);

            const response = await api.resendSetupLink(id);
            setNotice(response.message);

            await load();
        } catch (e) {
            setError(e.data?.message || "Envoi impossible.");
            // La demande a pu disparaître (compte supprimé définitivement → demande retirée).
            if (e.status === 422) await load().catch(() => {});
        } finally {
            setBusyId(null);
        }
    }

    // Motif obligatoire (envoyé au demandeur), saisi dans la fenêtre de confirmation.
    async function reject(id, reason) {
        if (busyId) return;
        setBusyId(id);
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
        } finally {
            setBusyId(null);
        }
    }

    // Boutons d'une ligne (Vérifier / Valider / Rejeter) : confirmation « Oui / Non » avant toute opération.
    const [rowAction, setRowAction] = useState(null); // { action: 'verify' | 'validate' | 'reject', row }
    async function runRowAction(reason) {
        const { action, row } = rowAction;
        if (action === "verify") await verify(row.id);
        else if (action === "validate") await validate(row.id);
        else await reject(row.id, reason);
        setRowAction(null);
    }

    function renderActions(r) {
        return (
            <>
                <ViewButton onClick={() => setViewing(r)} />
                {/* Bibliothécaire : une demande non validée est d'abord vérifiée. */}
                {user?.role !== "administrateur" && r.status === "en_attente" && (
                    <>
                        <button
                            onClick={() => setRowAction({ action: "verify", row: r })}
                            disabled={busyId !== null}
                            className="btn-secondary disabled:opacity-50"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {busyId === r.id ? "Vérification…" : "Vérifier"}
                        </button>
                        <button
                            onClick={() => setRowAction({ action: "reject", row: r })}
                            className="text-sm font-bold text-rose-700"
                        >
                            <XCircle className="mr-1 inline h-4 w-4" />
                            Rejeter
                        </button>
                    </>
                )}
                {/* Administrateur : validation directe, sans étape « Vérifier ». */}
                {user?.role === "administrateur" && ["en_attente", "verifiee"].includes(r.status) && (
                    <>
                        <button
                            onClick={() => setRowAction({ action: "validate", row: r })}
                            disabled={busyId !== null}
                            className="btn-primary disabled:opacity-50"
                        >
                            <ShieldCheck className="h-4 w-4" />
                            {busyId === r.id ? "Validation…" : "Valider"}
                        </button>
                        <button
                            onClick={() => setRowAction({ action: "reject", row: r })}
                            className="text-sm font-bold text-rose-700"
                        >
                            <XCircle className="mr-1 inline h-4 w-4" />
                            Rejeter
                        </button>
                    </>
                )}
                {r.status === "validee" && !r.setup_expires_at ? (
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
                {/* Export de la liste affichée : catégorie sélectionnée et recherche, toutes les pages. */}
                <ExportButton onExport={() => api.exportAccountRequests({ status: statusParam, search: searchTerm })} />
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

            {/* Cartes de compteurs : un clic filtre la liste (« Total » ou la carte active : toutes les catégories). */}
            <div
                className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 ${filters.length > 4 ? "lg:grid-cols-4 xl:grid-cols-7" : "lg:grid-cols-5"}`}
                role="status"
                aria-live="polite"
            >
                {counts ? (
                    ["total", ...filters].map((key) => (
                        <StatCard
                            key={key}
                            label={key === "total" ? "Total" : LABELS[key]}
                            value={key === "total" ? filters.reduce((sum, k) => sum + (counts[k] ?? 0), 0) : counts[key] ?? 0}
                            icon={CARD_STYLES[key].icon}
                            tone={CARD_STYLES[key].tone}
                            active={filter === key}
                            onClick={() => selectFilter(key)}
                        />
                    ))
                ) : (
                    Array.from({ length: filters.length + 1 }, (_, i) => <StatCardSkeleton key={i} />)
                )}
            </div>

            <div ref={listRef} className="scroll-mt-24" />

            {notice && (
                <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                    {notice}
                </div>
            )}

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
                {/* Sélection multiple (administrateur) : « tout sélectionner » et actions groupées. */}
                {selectableRows.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => el && (el.indeterminate = selectedRows.length > 0 && !allSelected)}
                                onChange={toggleAll}
                                className="h-4 w-4 accent-brass"
                            />
                            {selectedRows.length === 0
                                ? "Tout sélectionner"
                                : allPages
                                    ? `Les ${totalSelectable} demande(s) sont sélectionnées (toutes les pages)`
                                    : `${selectedRows.length} demande(s) sélectionnée(s) sur ${selectableRows.length}`}
                        </label>
                        {/* Toute la page est cochée et d'autres demandes existent sur les pages suivantes. */}
                        {allSelected && totalSelectable > selectableRows.length && (
                            <button
                                type="button"
                                onClick={() => setAllPages((value) => !value)}
                                className="text-sm font-semibold text-brass underline-offset-2 hover:underline"
                            >
                                {allPages
                                    ? `Ne sélectionner que cette page (${selectableRows.length})`
                                    : `Sélectionner les ${totalSelectable} demandes`}
                            </button>
                        )}
                        {selectedRows.length > 0 && !isAdmin && (
                            <button type="button" onClick={() => setBulk({ action: "verify", all: allSelected })} className="btn-primary">
                                <CheckCircle2 className="h-4 w-4" />
                                {allSelected ? "Vérifier toutes les demandes" : "Vérifier"}
                            </button>
                        )}
                        {selectedRows.length > 0 && isAdmin && (
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => setBulk({ action: "validate", all: allSelected })} className="btn-primary">
                                    <ShieldCheck className="h-4 w-4" />
                                    {allSelected ? "Valider toutes les demandes" : "Valider"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBulk({ action: "reject", all: allSelected })}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:brightness-95"
                                >
                                    <XCircle className="h-4 w-4" />
                                    {allSelected ? "Toutes rejetées" : "Rejeter"}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-surface sm:block">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                {selectableRows.length > 0 && (
                                    <th className="w-10 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            ref={(el) => el && (el.indeterminate = selectedRows.length > 0 && !allSelected)}
                                            onChange={toggleAll}
                                            aria-label="Sélectionner toutes les demandes"
                                            className="h-4 w-4 accent-brass"
                                        />
                                    </th>
                                )}
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
                                        colSpan={selectableRows.length > 0 ? 6 : 5}
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
                                        className={`border-t border-slate-100 ${selected.has(r.id) ? "bg-indigo-50" : ""}`}
                                    >
                                        {selectableRows.length > 0 && (
                                            <td className="px-4 py-3">
                                                {isSelectable(r) && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(r.id)}
                                                        onChange={() => toggleOne(r.id)}
                                                        aria-label={`Sélectionner la demande de ${r.first_name || ""} ${r.last_name || ""}`}
                                                        className="h-4 w-4 accent-brass"
                                                    />
                                                )}
                                            </td>
                                        )}
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
                        <div key={r.id} className={`rounded-2xl border p-4 ${selected.has(r.id) ? "border-brass bg-indigo-50" : "border-slate-200 bg-surface"}`}>
                            <div className="flex items-start justify-between gap-2">
                                {isSelectable(r) && (
                                    <input
                                        type="checkbox"
                                        checked={selected.has(r.id)}
                                        onChange={() => toggleOne(r.id)}
                                        aria-label={`Sélectionner la demande de ${r.first_name || ""} ${r.last_name || ""}`}
                                        className="mt-1 h-4 w-4 shrink-0 accent-brass"
                                    />
                                )}
                                <div className="min-w-0 flex-1">
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

            {rowAction && (() => {
                const name = `${rowAction.row.first_name || ""} ${rowAction.row.last_name || ""}`.trim();
                const texts = {
                    verify: {
                        title: "Vérifier cette demande ?",
                        message: `La demande de ${name} sera marquée « Vérifiée » et transmise à l'administrateur.`,
                        confirm: "Oui, vérifier",
                    },
                    validate: {
                        title: "Valider cette demande ?",
                        message: `Le compte de ${name} sera créé (actif) et recevra le lien de création du mot de passe.`,
                        confirm: "Oui, valider",
                    },
                    reject: {
                        title: "Rejeter cette demande ?",
                        message: `La demande de ${name} sera rejetée. Le demandeur recevra le motif par e-mail.`,
                        confirm: "Oui, rejeter",
                    },
                }[rowAction.action];
                return (
                    <ConfirmDialog
                        danger={rowAction.action === "reject"}
                        title={texts.title}
                        message={texts.message}
                        confirmLabel={texts.confirm}
                        reasonLabel={rowAction.action === "reject" ? "Motif du rejet (obligatoire, envoyé au demandeur)" : undefined}
                        busy={busyId === rowAction.row.id}
                        onConfirm={runRowAction}
                        onCancel={() => setRowAction(null)}
                    />
                );
            })()}

            {bulk && (
                <ConfirmDialog
                    danger={bulk.action === "reject"}
                    title={{
                        reject: bulk.all ? "Rejeter toutes les demandes ?" : "Rejeter les demandes sélectionnées ?",
                        verify: bulk.all ? "Vérifier toutes les demandes ?" : "Vérifier les demandes sélectionnées ?",
                        validate: bulk.all ? "Valider toutes les demandes ?" : "Valider les demandes sélectionnées ?",
                    }[bulk.action]}
                    message={{
                        reject: `${selectedCount} demande(s) seront rejetées. Chaque demandeur recevra le motif par e-mail.`,
                        verify: `${selectedCount} demande(s) seront marquées « Vérifiée » et transmises à l'administrateur pour validation.`,
                        validate: `${selectedCount} demande(s) seront validées. Chaque compte sera créé (actif) et recevra le lien de création du mot de passe.`,
                    }[bulk.action]}
                    confirmLabel={{ reject: "Oui, rejeter", verify: "Oui, vérifier", validate: "Oui, valider" }[bulk.action]}
                    reasonLabel={bulk.action === "reject" ? "Motif du rejet (obligatoire, envoyé aux demandeurs)" : undefined}
                    busy={bulkBusy}
                    onConfirm={runBulk}
                    onCancel={() => setBulk(null)}
                />
            )}

            {viewing && (
                <ProfileDetailModal
                    title={`${viewing.first_name || ""} ${viewing.last_name || ""}`.trim()}
                    subtitle={viewing.email}
                    photoUrl={(viewing.created_user || viewing.createdUser)?.photo_url}
                    badges={[
                        { label: ROLES[viewing.role] || viewing.role },
                        viewing.status === "validee" && !viewing.setup_expires_at
                            ? { label: LABELS.compte_active, tone: "success" }
                            : { label: LABELS[viewing.status] || viewing.status, tone: STATUS_TONES[viewing.status] },
                    ]}
                    highlights={[
                        ["Numéro de demande", viewing.request_number],
                        ["Rôle demandé", ROLES[viewing.role] || viewing.role],
                        ["Date de demande", formatDateTime(viewing.created_at)],
                    ]}
                    sections={requestSections(viewing, LABELS)}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
