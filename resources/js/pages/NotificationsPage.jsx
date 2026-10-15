import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BookOpen,
    CheckCircle2,
    UserPlus,
    Clock3,
    Bell,
    CheckCheck,
    Inbox,
    FilePlus2,
    Pencil,
    Archive,
    Trash2,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { api } from "../lib/api";
import LocalTimeFilters, { EMPTY_TIME_FILTERS } from "../components/LocalTimeFilters";
import { usePageRefresh } from "../context/RefreshContext";
import Pager from "../components/Pager";
import { SkeletonList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";

const TYPE_ICONS = {
    document_publie: BookOpen,
    document_ajoute: FilePlus2,
    document_modifie: Pencil,
    document_archive: Archive,
    document_supprime: Trash2,
    compte_valide: CheckCircle2,
    compte_a_valider: UserPlus,
    compte_expire: Clock3,
    permissions_mises_a_jour: CheckCircle2,
    // Espace enseignant
    lecture_recommandee: BookOpen,
    depot_publie: CheckCircle2,
    depot_refuse: Pencil,
    classe_demandee: UserPlus,
    classe_acceptee: CheckCircle2,
    classe_refusee: Clock3,
};

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    // Au-delà d'un jour : date ET heure (utile avec le filtre « Heure de réception »).
    const date = new Date(dateStr);
    return `${date.toLocaleDateString("fr-FR")} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState(null);
    const [error, setError] = useState(null);
    // Pagination du serveur (20 par page) : sans elle, les notifications plus anciennes étaient inaccessibles.
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState(null);
    const navigate = useNavigate();
    // Recherche (envoyée après une courte pause de frappe) et filtres, appliqués par le serveur sur toutes les pages.
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filters, setFilters] = useState(EMPTY_TIME_FILTERS);
    const [showFilters, setShowFilters] = useState(false);

    const activeFilterCount = Object.values(filters).filter(Boolean).length;
    const isFiltering = Boolean(debouncedSearch.trim()) || activeFilterCount > 0;

    // Nouvelle recherche : retour à la première page (dans la même mise à jour : une seule requête).
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Seule la réponse de la dernière requête est affichée (frappe rapide, changements de filtres successifs).
    const requestRef = useRef(0);
    async function fetchNotifications() {
        const requestId = ++requestRef.current;
        const res = await api.getNotifications(page, { search: debouncedSearch.trim(), ...filters });
        if (requestId !== requestRef.current) return;
        setNotifications(res.data);
        setMeta(res);
        setError(null);
    }

    useEffect(() => {
        load();
    }, [page, debouncedSearch, filters]);

    usePageRefresh(fetchNotifications);

    function load() {
        fetchNotifications().catch(() => {
            setError("Impossible de charger vos notifications.");
            setNotifications((prev) => prev ?? []);
        });
    }

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    }

    function resetFilters() {
        setSearch("");
        setDebouncedSearch("");
        setFilters(EMPTY_TIME_FILTERS);
        setPage(1);
    }

    async function openNotification(notification) {
        await markRead(notification);
        if (notification.related_url) navigate(notification.related_url);
    }

    async function markRead(notification) {
        if (notification.read_at) return;
        setNotifications((prev) =>
            (prev || []).map((n) =>
                n.id === notification.id
                    ? { ...n, read_at: new Date().toISOString() }
                    : n,
            ),
        );
        try {
            await api.markNotificationRead(notification.id);
        } catch {
            load(); // resynchronise en cas d'échec
        }
    }

    async function markUnread(notification) {
        setNotifications((prev)=>(prev||[]).map(n=>n.id===notification.id?{...n,read_at:null}:n));
        try { await api.markNotificationUnread(notification.id); } catch { load(); }
    }

    async function markAllRead() {
        setNotifications((prev) =>
            (prev || []).map((n) => ({
                ...n,
                read_at: n.read_at || new Date().toISOString(),
            })),
        );
        try {
            await api.markAllNotificationsRead();
        } catch {
            load();
        }
    }

    const hasUnread = notifications?.some((n) => !n.read_at);

    return (
        <div className="w-full">
            <div className="flex items-baseline justify-between mb-8">
                <h1 className="flex items-center gap-2 font-display text-2xl  text-brass hover:text-brass-deep">
                    <Bell
                        className="h-6 w-6  text-brass hover:text-brass-deep"
                        strokeWidth={1.75}
                    />
                    Notifications
                </h1>
                {hasUnread && (
                    <button
                        onClick={markAllRead}
                        className="flex items-center gap-1.5 text-sm text-blue-700 hover:underline"
                    >
                        <CheckCheck className="h-4 w-4" strokeWidth={1.75} />
                        Tout marquer comme lu
                    </button>
                )}
            </div>

            {/* Recherche + filtres */}
            <div className="mb-5 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher une notification…"
                            aria-label="Rechercher dans mes notifications"
                            className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowFilters((v) => !v)}
                        aria-expanded={showFilters}
                        className={`btn-secondary shrink-0 justify-center ${activeFilterCount ? "border-brass text-brass-deep" : ""}`}
                    >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                        Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}
                    </button>
                </div>

                {showFilters && (
                    <div className="modern-card grid gap-3 p-4 sm:grid-cols-3">
                        <LocalTimeFilters value={filters} onChange={setFilter} timeLabel="Heure de réception" />
                    </div>
                )}

                {isFiltering && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                        <span>{meta?.total != null ? `${meta.total} notification${meta.total > 1 ? "s" : ""} trouvée${meta.total > 1 ? "s" : ""}` : "Recherche…"}</span>
                        <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-semibold text-brass hover:text-brass-deep">
                            <X className="h-4 w-4" aria-hidden="true" /> Réinitialiser
                        </button>
                    </div>
                )}
            </div>

            {error && <p className="text-red-700">{error}</p>}

            {notifications === null && <SkeletonList count={5} />}

            {notifications?.length === 0 && (
                isFiltering ? (
                    <EmptyState
                        icon={Search}
                        title="Aucune notification ne correspond"
                        description="Essayez un autre mot ou modifiez les filtres."
                    />
                ) : (
                    <EmptyState
                        icon={Inbox}
                        title="Aucune notification"
                        description="Vous serez prévenu ici dès qu'une action vous concerne."
                    />
                )
            )}

            {notifications?.length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line bg-paper overflow-hidden">
                    {notifications.map((n) => {
                        const Icon = TYPE_ICONS[n.type] || Bell;
                        return (
                            <li
                                key={n.id}
                                onClick={() => openNotification(n)}
                                className={`p-4 flex gap-3 cursor-pointer transition-colors ${
                                    n.read_at ? "bg-paper" : "bg-indigo-50"
                                } hover:bg-paper-dim`}
                            >
                                <span className="flex-shrink-0 h-8 w-8 rounded-full bg-paper-dim flex items-center justify-center text-ink-soft mt-0.5">
                                    <Icon
                                        className="h-4 w-4"
                                        strokeWidth={1.75}
                                    />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={`text-sm ${n.read_at ? "text-ink-soft" : "text-ink font-medium"}`}
                                    >
                                        {n.title}
                                    </p>
                                    {n.message && (
                                        <p className="text-xs text-ink-soft mt-0.5">
                                            {n.message}
                                        </p>
                                    )}
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        {timeAgo(n.created_at)}
                                    </p>
                                </div>
                                <div className="mt-1 flex shrink-0 items-center gap-2" onClick={(e)=>e.stopPropagation()}>
                                    {n.read_at ? <button type="button" onClick={()=>markUnread(n)} className="text-[11px] font-semibold text-blue-700 hover:underline">Marquer comme non lu</button> : <span className="h-2 w-2 rounded-full bg-blue-700" />}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Pager meta={meta} onChange={setPage} />
        </div>
    );
}
