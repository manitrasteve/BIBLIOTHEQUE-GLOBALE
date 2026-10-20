import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Mail, MessageCircle, PenLine, Search, Send, SlidersHorizontal, Trash2, UserCheck, Users, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import Pager from "../../components/Pager";
import { useConfirm } from "../../components/ConfirmDialog";
import { usePageRefresh } from "../../context/RefreshContext";
import LocalTimeFilters, { EMPTY_TIME_FILTERS } from "../../components/LocalTimeFilters";

// Limite du serveur (règle « message » d'AdminMessageController::store).
const MAX_MESSAGE_LENGTH = 10000;

const ROLE_LABELS = {
    etudiant: { one: "Étudiant", plural: "Étudiants" },
    enseignant: { one: "Enseignant", plural: "Enseignants" },
    chercheur: { one: "Chercheur", plural: "Chercheurs" },
};

const sectionTitle = "text-xs font-bold uppercase tracking-wider text-ink-soft";
const labelClass = "mb-1.5 block text-sm font-semibold text-ink";
const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

const normalize = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function initials(name) {
    return String(name || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
}

const plural = (count, word) => `${count} ${word}${count > 1 ? "s" : ""}`;

function Notice({ notice }) {
    if (!notice) return null;
    const isError = notice.type === "error";
    return (
        <p
            role={isError ? "alert" : "status"}
            className={`flex items-center gap-2 rounded-lg p-3 text-sm font-semibold ${isError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
        >
            {isError ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {notice.text}
        </p>
    );
}

// Carte d'accès en haut de la page : ouvre le formulaire d'envoi ou la discussion.
function ActionCard({ as: Component = "button", active = false, Icon, title, description, ...props }) {
    return (
        <Component
            {...props}
            className={`group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${
                active ? "border-indigo-400 bg-indigo-100" : "border-line bg-surface hover:border-indigo-400"
            }`}
        >
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${active ? "bg-indigo-600 text-white" : "bg-paper-dim text-indigo-400"}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 flex-1">
                <span className="font-display text-base font-extrabold text-ink">{title}</span>
                <span className="text-sm text-ink-soft">{description}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Component>
    );
}

export default function AdminMessagesPage() {
    const confirm = useConfirm();
    const { user } = useAuth();
    const isLibrarian = user?.role === "bibliothecaire";
    const [users, setUsers] = useState([]);
    const [history, setHistory] = useState([]);
    const [form, setForm] = useState({ subject: "", message: "", send_to_all: true, recipient_ids: [] });
    const [notice, setNotice] = useState(null); // { type: "success" | "error", text }
    const [loading, setLoading] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    // Vue affichée : historique des envois (par défaut) ou formulaire d'envoi (?vue=nouveau).
    const [searchParams, setSearchParams] = useSearchParams();
    const composing = searchParams.get("vue") === "nouveau";
    // Historique paginé par le serveur (20 par page).
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState(null);
    // Recherche (objet, texte ; envoyée après une courte pause de frappe) et filtres date / jour / heure,
    // appliqués par le serveur à tout l'historique.
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filters, setFilters] = useState(EMPTY_TIME_FILTERS);
    const [showFilters, setShowFilters] = useState(false);
    const activeFilterCount = Object.values(filters).filter(Boolean).length;
    const isFiltering = Boolean(debouncedSearch.trim()) || activeFilterCount > 0;

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Seule la réponse de la dernière requête est affichée (frappe rapide, filtres changés à la suite).
    const requestRef = useRef(0);
    async function fetchData() {
        const requestId = ++requestRef.current;
        const [recipients, messages] = await Promise.all([
            api.getMessageRecipients(),
            api.getAdminMessages(page, { search: debouncedSearch.trim(), ...filters }),
        ]);
        if (requestId !== requestRef.current) return;
        setUsers(recipients || []);
        setHistory(messages.data || []);
        setMeta(messages);
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

    async function load() {
        try {
            await fetchData();
        } catch (e) {
            setNotice({ type: "error", text: e?.data?.message || "Impossible de charger la messagerie." });
        }
    }

    useEffect(() => { load(); }, [page, debouncedSearch, filters]);
    usePageRefresh(fetchData);

    async function send(e) {
        e.preventDefault();
        if (!form.send_to_all && form.recipient_ids.length === 0) {
            setNotice({ type: "error", text: "Choisissez au moins un destinataire." });
            return;
        }
        setLoading(true); setNotice(null);
        try {
            await api.sendAdminMessage(form);
            setNotice({ type: "success", text: "Message envoyé avec succès." });
            setForm({ subject: "", message: "", send_to_all: true, recipient_ids: [] });
            setRecipientSearch("");
            setRoleFilter("");
            setSearchParams({});
            await load();
        } catch (e) {
            setNotice({ type: "error", text: e?.data?.message || "Envoi impossible." });
        } finally { setLoading(false); }
    }

    async function remove(id) {
        if (!(await confirm({ title: "Supprimer ce message de votre historique ?", danger: true }))) return;
        try { await api.deleteAdminMessage(id); await load(); }
        catch (e) { setNotice({ type: "error", text: e?.data?.message || "Suppression impossible." }); }
    }

    async function clear() {
        if (!(await confirm({ title: "Supprimer tout votre historique de messages envoyés ?", danger: true }))) return;
        try { await api.clearAdminMessageHistory(); setHistory([]); }
        catch (e) { setNotice({ type: "error", text: e?.data?.message || "Suppression impossible." }); }
    }

    function toggleRecipient(id) {
        setForm((prev) => ({
            ...prev,
            recipient_ids: prev.recipient_ids.includes(id)
                ? prev.recipient_ids.filter((r) => r !== id)
                : [...prev.recipient_ids, id],
        }));
    }

    // Rôles présents dans la liste (filtres) et comptes affichés selon la recherche et le rôle choisi.
    const roles = [...new Set(users.map((u) => u.role))];
    const query = normalize(recipientSearch.trim());
    const visibleUsers = users.filter(
        (u) => (!roleFilter || u.role === roleFilter) && (!query || normalize(u.name).includes(query) || normalize(u.email).includes(query)),
    );

    function selectVisible() {
        setForm((prev) => ({ ...prev, recipient_ids: [...new Set([...prev.recipient_ids, ...visibleUsers.map((u) => u.id)])] }));
    }

    const selectedCount = form.recipient_ids.length;

    function openComposer() {
        setNotice(null);
        setSearchParams({ vue: "nouveau" });
    }

    function closeComposer() {
        setNotice(null);
        setSearchParams({});
    }

    return (
        <div className="w-full space-y-5">
            <div>
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <Mail className="h-5 w-5 text-brass" />
                    Messages
                </h2>
                <p className="mt-1 text-sm text-slate-500">Écrivez aux membres de la bibliothèque ou échangez avec {isLibrarian ? "l’administrateur" : "les bibliothécaires"}.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <ActionCard
                    type="button"
                    onClick={composing ? closeComposer : openComposer}
                    active={composing}
                    aria-expanded={composing}
                    Icon={PenLine}
                    title="Messages aux utilisateurs"
                    description={isLibrarian
                        ? "Envoyer une information aux membres. L’administrateur en reçoit une copie."
                        : "Envoyer une information aux membres, et aux bibliothécaires lors d’un envoi général."}
                />
                <ActionCard
                    as={Link}
                    to={isLibrarian ? "/bibliothecaire/discussions" : "/administrateur/discussions"}
                    Icon={MessageCircle}
                    title={`Échange avec ${isLibrarian ? "l’administrateur" : "les bibliothécaires"}`}
                    description={isLibrarian ? "Discuter directement avec l’administrateur." : "Discuter directement avec les bibliothécaires."}
                />
            </div>

            {composing && (
            <form onSubmit={send} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
                    <h3 className={sectionTitle}>Rédiger</h3>
                    <div>
                        <label htmlFor="message-subject" className={labelClass}>Objet</label>
                        <input
                            id="message-subject"
                            required
                            maxLength={255}
                            placeholder="Ex. : Fermeture exceptionnelle le vendredi 24 octobre"
                            value={form.subject}
                            onChange={(e) => setForm({ ...form, subject: e.target.value })}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="message-body" className={labelClass}>Message</label>
                        <textarea
                            id="message-body"
                            required
                            rows="8"
                            maxLength={MAX_MESSAGE_LENGTH}
                            placeholder="Votre message"
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                            className={`${inputClass} resize-y`}
                        />
                        <p className="mt-1 text-right text-xs tabular-nums text-ink-soft">
                            {form.message.length.toLocaleString("fr-FR")} / {MAX_MESSAGE_LENGTH.toLocaleString("fr-FR")} caractères
                        </p>
                    </div>

                    <div>
                        <span className={labelClass}>Destinataires</span>
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-paper-dim p-1" role="radiogroup" aria-label="Destinataires">
                            {[
                                { value: true, label: "Tous les comptes actifs", Icon: Users },
                                { value: false, label: "Choisir des destinataires", Icon: UserCheck },
                            ].map(({ value, label, Icon }) => (
                                <button
                                    key={label}
                                    type="button"
                                    role="radio"
                                    aria-checked={form.send_to_all === value}
                                    onClick={() => setForm({ ...form, send_to_all: value })}
                                    className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm font-bold transition-colors ${
                                        form.send_to_all === value ? "border-line bg-surface text-ink" : "border-transparent text-ink-soft hover:text-ink"
                                    }`}
                                >
                                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="text-center leading-tight">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {form.send_to_all ? (
                        <p className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink-soft">
                            <Users className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
                            <span>
                                <strong className="text-ink">{plural(users.length, "membre")} actif{users.length > 1 ? "s" : ""}</strong>
                                {isLibrarian ? "" : ", ainsi que les bibliothécaires,"} recevront ce message.
                            </span>
                        </p>
                    ) : (
                        <div className="overflow-hidden rounded-lg border border-line">
                            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                                <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
                                <input
                                    type="search"
                                    value={recipientSearch}
                                    onChange={(e) => setRecipientSearch(e.target.value)}
                                    placeholder="Rechercher un nom ou un e-mail…"
                                    aria-label="Rechercher un destinataire"
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
                                />
                            </div>
                            {roles.length > 1 && (
                                <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
                                    {["", ...roles].map((role) => (
                                        <button
                                            key={role || "all"}
                                            type="button"
                                            onClick={() => setRoleFilter(role)}
                                            aria-pressed={roleFilter === role}
                                            className={`rounded-full border px-3 py-0.5 text-xs font-semibold transition-colors ${
                                                roleFilter === role ? "border-indigo-600 bg-indigo-600 text-white" : "border-line text-ink-soft hover:border-brass"
                                            }`}
                                        >
                                            {role ? ROLE_LABELS[role]?.plural || role : "Tous"}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <ul className="max-h-64 overflow-y-auto" aria-label="Comptes">
                                {visibleUsers.map((u) => {
                                    const checked = form.recipient_ids.includes(u.id);
                                    return (
                                        <li key={u.id} className="border-b border-line last:border-b-0">
                                            <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${checked ? "bg-indigo-50" : "hover:bg-paper"}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleRecipient(u.id)}
                                                    className="h-4 w-4 shrink-0"
                                                />
                                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-dim text-[11px] font-extrabold text-brass-deep" aria-hidden="true">
                                                    {initials(u.name)}
                                                </span>
                                                <span className="grid min-w-0 flex-1">
                                                    <span className="truncate text-sm font-semibold text-ink">{u.name}</span>
                                                    <span className="truncate text-xs text-ink-soft">{u.email}</span>
                                                </span>
                                                <span className="hidden shrink-0 text-xs font-semibold text-ink-soft sm:inline">
                                                    {ROLE_LABELS[u.role]?.one || u.role}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                                {visibleUsers.length === 0 && (
                                    <li className="px-3 py-6 text-center text-sm text-ink-soft">Aucun compte ne correspond à cette recherche.</li>
                                )}
                            </ul>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-3 py-2 text-xs font-bold">
                                <span className="tabular-nums text-ink">
                                    {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
                                </span>
                                <span className="flex gap-3">
                                    {visibleUsers.length > 0 && (
                                        <button type="button" onClick={selectVisible} className="text-brass hover:text-brass-deep">
                                            Tout sélectionner ({visibleUsers.length})
                                        </button>
                                    )}
                                    {selectedCount > 0 && (
                                        <button type="button" onClick={() => setForm({ ...form, recipient_ids: [] })} className="text-ink-soft hover:text-ink">
                                            Vider
                                        </button>
                                    )}
                                </span>
                            </div>
                        </div>
                    )}

                    <Notice notice={notice} />

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <p className="mr-auto text-xs text-ink-soft">
                            {isLibrarian
                                ? "L’administrateur reçoit une copie."
                                : form.send_to_all
                                  ? "Les bibliothécaires sont aussi informés."
                                  : "Seuls les comptes choisis reçoivent le message."}
                        </p>
                        <button type="button" onClick={closeComposer} className="btn-secondary">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Annuler
                        </button>
                        <button disabled={loading} className="btn-primary disabled:opacity-50">
                            <Send className="h-4 w-4" aria-hidden="true" /> {loading ? "Envoi…" : "Envoyer"}
                        </button>
                    </div>
                </div>

                <aside className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-4">
                    <h3 className={sectionTitle}>Aperçu destinataire</h3>
                    <div className="grid grid-cols-[34px_1fr] gap-3 rounded-xl border border-line bg-paper p-3">
                        <span className="grid h-8.5 w-8.5 place-items-center rounded-lg bg-indigo-600 text-gold" aria-hidden="true">
                            <Mail className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="break-words text-sm font-bold text-ink">{form.subject.trim() || "Objet du message"}</p>
                            <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-xs text-ink-soft">
                                {form.message.trim() || "Le début de votre message apparaîtra ici."}
                            </p>
                            <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
                                <span className="rounded-full bg-amber-50 px-2 py-px font-bold text-brass">
                                    {isLibrarian ? "Bibliothécaire" : "Administrateur"}
                                </span>
                                à l’instant
                            </p>
                        </div>
                    </div>

                    <h3 className={sectionTitle}>Récapitulatif</h3>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                            <dt className="text-ink-soft">Destinataires</dt>
                            <dd className="text-right font-bold tabular-nums text-ink">
                                {form.send_to_all
                                    ? `${plural(users.length, "membre")}${isLibrarian ? "" : " + bibliothécaires"}`
                                    : `${plural(selectedCount, "compte")} choisi${selectedCount > 1 ? "s" : ""}`}
                            </dd>
                        </div>
                        {isLibrarian && (
                            <div className="flex justify-between gap-3">
                                <dt className="text-ink-soft">Copie</dt>
                                <dd className="text-right font-bold text-ink">Administrateur</dd>
                            </div>
                        )}
                        <div className="flex justify-between gap-3">
                            <dt className="text-ink-soft">Reçu dans</dt>
                            <dd className="text-right font-bold text-ink">Messages, notification et e-mail</dd>
                        </div>
                    </dl>
                </aside>
            </form>
            )}

            {!composing && (
            <section className="space-y-3">
                <Notice notice={notice} />
                <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display font-bold">Historique des envois</h3>
                    {history.length > 0 && !isFiltering && <button onClick={clear} className="flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:text-red-700"><Trash2 className="h-4 w-4" /> Supprimer tous les historiques</button>}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher par objet ou texte du message…"
                            aria-label="Rechercher dans l'historique des envois"
                            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm"
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
                    <div className="modern-card grid gap-3 p-4 sm:grid-cols-3">
                        <LocalTimeFilters value={filters} onChange={setFilter} timeLabel="Heure d'envoi" />
                    </div>
                )}

                {isFiltering && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
                        <span>{meta?.total != null ? `${plural(meta.total, "envoi")} trouvé${meta.total > 1 ? "s" : ""}` : "Recherche…"}</span>
                        <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-semibold text-brass hover:text-brass-deep">
                            <X className="h-4 w-4" aria-hidden="true" /> Réinitialiser
                        </button>
                    </div>
                )}

                <div className="space-y-2">
                    {history.map((item) => (
                        <div key={item.id} className="modern-card flex items-start justify-between gap-4 p-4">
                            <div className="min-w-0"><p className="font-bold">{item.subject}</p><p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{item.message}</p><p className="mt-2 text-xs text-slate-500">{item.recipient_count} destinataire(s) · {new Date(item.created_at).toLocaleString("fr-FR")}</p></div>
                            <button onClick={() => remove(item.id)} title="Supprimer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    ))}
                    {history.length === 0 && (
                        <div className="modern-card p-5 text-center text-sm text-slate-500">
                            {isFiltering ? "Aucun envoi ne correspond à cette recherche." : "Aucun message envoyé."}
                        </div>
                    )}
                </div>
                <Pager meta={meta} onChange={setPage} />
            </section>
            )}
        </div>
    );
}
