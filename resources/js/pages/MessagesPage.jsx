import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, Trash2, UserRound, CheckCheck, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "../lib/api";
import Pager from "../components/Pager";
import { useConfirm } from "../components/ConfirmDialog";
import { usePageRefresh } from "../context/RefreshContext";
import LocalTimeFilters, { EMPTY_TIME_FILTERS, filterFieldClass } from "../components/LocalTimeFilters";

const EMPTY_FILTERS = { sender_role: "", ...EMPTY_TIME_FILTERS };

const SENDER_ROLES = [
    { value: "", label: "Tous les expéditeurs" },
    { value: "administrateur", label: "Administrateur" },
    { value: "bibliothecaire", label: "Bibliothécaire" },
];

const ROLE_LABELS = { administrateur: "Administrateur", admin: "Administrateur", bibliothecaire: "Bibliothécaire" };

export default function MessagesPage() {
    const confirm = useConfirm();
    const [items, setItems] = useState(null);
    const [params] = useSearchParams();
    const [error, setError] = useState(null);
    // Pagination du serveur (30 par page) : sans elle, les messages plus anciens étaient inaccessibles.
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState(null);
    // Recherche (envoyée après une courte pause de frappe) et filtres, appliqués par le serveur sur toutes les pages.
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [showFilters, setShowFilters] = useState(false);

    const activeFilterCount = Object.values(filters).filter(Boolean).length;
    const isFiltering = Boolean(debouncedSearch.trim()) || activeFilterCount > 0;
    const query = { search: debouncedSearch.trim(), ...filters };

    // Nouvelle recherche / nouveau filtre : retour à la première page (dans la même mise à jour : une seule requête).
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Seule la réponse de la dernière requête est affichée (frappe rapide, changements de filtres successifs).
    const requestRef = useRef(0);
    async function fetchMessages() {
        const requestId = ++requestRef.current;
        const response = await api.getMessages(page, query);
        if (requestId !== requestRef.current) return;
        setItems(response.data || []);
        setMeta(response);
        setError(null);
    }

    async function load() {
        try { await fetchMessages(); }
        catch (e) { setError(e?.data?.message || "Impossible de charger vos messages."); setItems([]); }
    }
    useEffect(() => { load(); }, [page, debouncedSearch, filters]);
    usePageRefresh(fetchMessages);

    useEffect(() => {
        const id = params.get("message");
        if (!id || !items) return;
        const item = items.find((x) => String(x.id) === String(id));
        if (item) {
            setTimeout(() => document.getElementById(`message-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            if (!item.read_at) open(item);
        }
    }, [items, params]);

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    }

    function resetFilters() {
        setSearch("");
        setDebouncedSearch("");
        setFilters(EMPTY_FILTERS);
        setPage(1);
    }

    async function open(item) {
        if (item.read_at) return;
        setItems((current) => current.map((x) => x.id === item.id ? { ...x, read_at: new Date().toISOString() } : x));
        try { await api.markMessageRead(item.id); } catch { load(); }
    }
    async function remove(id) {
        if (!(await confirm({ title: "Supprimer ce message de votre compte ?", danger: true }))) return;
        try { await api.deleteMessage(id); setItems((current) => current.filter((x) => x.id !== id)); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }
    async function clear() {
        if (!(await confirm({ title: "Supprimer tous vos historiques/messages ?", danger: true }))) return;
        try { await api.clearMessages(); setItems([]); setMeta(null); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div><h1 className="flex items-center gap-2 font-display text-2xl font-extrabold"><Mail className="h-6 w-6 text-brass" /> Messages</h1><p className="mt-1 text-sm text-slate-500">Les informations envoyées par la Bibliothèque apparaissent ici.</p></div>
                {items?.length > 0 && !isFiltering && <button onClick={clear} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Supprimer tous les historiques</button>}
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
                            placeholder="Rechercher dans l'objet, le message ou l'expéditeur…"
                            aria-label="Rechercher dans mes messages"
                            className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowFilters((v) => !v)}
                        aria-expanded={showFilters}
                        className={`btn-secondary shrink-0 justify-center ${activeFilterCount ? "border-indigo-400 text-ink" : ""}`}
                    >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                        Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}
                    </button>
                </div>

                {showFilters && (
                    <div className="modern-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block text-xs font-semibold text-slate-600">
                            Expéditeur
                            <select value={filters.sender_role} onChange={(e) => setFilter("sender_role", e.target.value)} className={`mt-1 ${filterFieldClass}`}>
                                {SENDER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </label>
                        <LocalTimeFilters value={filters} onChange={setFilter} timeLabel="Heure de réception" />
                    </div>
                )}

                {isFiltering && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                        <span>{meta ? `${meta.total} message${meta.total > 1 ? "s" : ""} trouvé${meta.total > 1 ? "s" : ""}` : "Recherche…"}</span>
                        <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-semibold text-brass hover:text-brass-deep">
                            <X className="h-4 w-4" aria-hidden="true" /> Réinitialiser
                        </button>
                    </div>
                )}
            </div>

            {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {items === null && <p className="text-sm text-slate-500">Chargement…</p>}
            {items?.length === 0 && (
                <div className="modern-card p-10 text-center text-slate-500">
                    {isFiltering ? <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" /> : <Mail className="mx-auto mb-3 h-8 w-8 text-slate-300" />}
                    <p>{isFiltering ? "Aucun message ne correspond à votre recherche ou à vos filtres." : "Aucun message pour le moment."}</p>
                </div>
            )}
            <div className="space-y-3">
                {items?.map((item) => {
                    const sender = item.message?.sender;
                    const roleLabel = ROLE_LABELS[sender?.role];
                    return (
                        <article id={`message-${item.id}`} key={item.id} onClick={() => open(item)} className={`modern-card cursor-pointer p-5 ${item.read_at ? "" : "border-indigo-200 bg-indigo-50"}`}>
                            <div className="flex items-start gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-brass-deep"><UserRound className="h-5 w-5" /></span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{item.message?.subject}</h2>{!item.read_at && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">Nouveau</span>}</div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {sender?.name || "Bibliothèque"}
                                        {roleLabel && <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{roleLabel}</span>}
                                        {" · "}{new Date(item.created_at).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.message?.message}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); remove(item.id); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50" title="Supprimer" aria-label="Supprimer ce message"><Trash2 className="h-4 w-4" /></button>
                            </div>
                            {item.read_at && <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-500"><CheckCheck className="h-3.5 w-3.5" /> Lu</p>}
                        </article>
                    );
                })}
            </div>
            <Pager meta={meta} onChange={setPage} />
        </div>
    );
}
