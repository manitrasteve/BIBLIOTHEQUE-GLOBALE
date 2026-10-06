import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BellRing, Check, Pencil, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/search";
import { useConfirm } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";
import AudienceFields from "./AudienceFields";
import { audienceLabel } from "./MyCoursesPage";

const TABS = [
    { key: "lectures", label: "Lectures" },
    { key: "suivi", label: "Suivi de la classe" },
    { key: "reglages", label: "Réglages" },
];

const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const today = () => new Date().toISOString().slice(0, 10);

// Catalogue publié, affiché d'emblée (les plus récents) et filtré par la recherche, pour ajouter un document.
function AddDocument({ list, onAdded }) {
    const toast = useToast();
    const [query, setQuery] = useState("");
    const q = useDebouncedValue(query.trim(), 350);
    const [results, setResults] = useState(null);
    const [meta, setMeta] = useState(null);
    const [loadError, setLoadError] = useState(false);
    const [busy, setBusy] = useState(null);
    const inList = new Set(list.items.map((i) => i.document?.slug));

    function fetchPage(page) {
        return api.searchDocuments({ ...(q ? { q } : {}), page });
    }

    useEffect(() => {
        let active = true;
        setLoadError(false);
        fetchPage(1)
            .then((r) => active && (setResults(r.data || []), setMeta(r)))
            .catch(() => active && (setResults([]), setLoadError(true)));
        return () => { active = false; };
    }, [q]);

    async function more() {
        const r = await fetchPage(meta.current_page + 1);
        setResults((current) => [...current, ...(r.data || [])]);
        setMeta(r);
    }

    async function add(doc) {
        setBusy(doc.slug);
        try {
            onAdded(await api.addCourseListItem(list.id, { slug: doc.slug }));
            toast(`« ${doc.title} » ajouté. Les étudiants de la classe sont notifiés.`);
        } catch (e) {
            toast(e?.data?.message || "Ajout impossible.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="rounded-xl border border-line bg-paper p-4">
            <label htmlFor="add-doc" className="text-sm font-bold">Ajouter un document du catalogue</label>
            <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    id="add-doc"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filtrer par titre, auteur, mot-clé…"
                    className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm"
                />
            </div>
            {results === null && <p className="mt-2 text-xs text-slate-500">Chargement du catalogue…</p>}
            {meta && results?.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                    {q ? `${meta.total} document${meta.total > 1 ? "s" : ""} trouvé${meta.total > 1 ? "s" : ""}` : `${meta.total} document${meta.total > 1 ? "s" : ""} publié${meta.total > 1 ? "s" : ""} dans le catalogue, du plus récent au plus ancien`}
                </p>
            )}
            {results?.length > 0 && (
                <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
                    {results.map((doc) => (
                        <li key={doc.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0">
                                <span className="block truncate font-semibold">{doc.title}</span>
                                <span className="text-xs text-slate-500">{[doc.type, (doc.authors || []).join(", "), doc.year].filter(Boolean).join(" · ")}</span>
                            </span>
                            {inList.has(doc.slug) ? (
                                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Ajouté</span>
                            ) : (
                                <button type="button" onClick={() => add(doc)} disabled={busy === doc.slug} className="btn-secondary shrink-0 !py-1.5 disabled:opacity-50">
                                    <Plus className="h-3.5 w-3.5" /> Ajouter
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {meta && meta.current_page < meta.last_page && (
                <button type="button" onClick={() => more().catch(() => toast("Chargement impossible."))} className="btn-secondary mt-2 w-full justify-center">
                    Afficher plus de documents
                </button>
            )}
            {loadError && <p className="mt-2 text-xs text-rose-700">Impossible de charger le catalogue. Réessayez avec le bouton Actualiser.</p>}
            {!loadError && results?.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">
                    {q ? "Aucun document publié ne correspond à cette recherche." : "Aucun document publié dans le catalogue pour le moment."}
                </p>
            )}
        </div>
    );
}

// Une lecture : consigne et date limite modifiables sur place.
function ItemRow({ list, item, onChanged }) {
    const confirm = useConfirm();
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ instruction: item.instruction || "", due_date: item.due_date || "" });

    async function save() {
        onChanged(await api.updateCourseListItem(list.id, item.id, { instruction: form.instruction.trim() || null, due_date: form.due_date || null }));
        setEditing(false);
    }

    async function remove() {
        if (!(await confirm({ title: `Retirer « ${item.document?.title} » de la bibliographie ?`, danger: true }))) return;
        onChanged(await api.removeCourseListItem(list.id, item.id));
    }

    return (
        <li className="py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link to={`/documents/${item.document?.slug}`} className="font-semibold hover:text-brass-deep">{item.document?.title}</Link>
                    {item.document?.status !== "publie" && <span className="ml-2 text-xs font-medium text-amber-700">(plus disponible dans le catalogue)</span>}
                    {!editing && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {item.instruction && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">{item.instruction}</span>}
                            {item.due_date && <span className="font-semibold text-slate-600">À lire avant le {formatDate(item.due_date)}</span>}
                            {!item.instruction && !item.due_date && <span className="text-slate-500">Sans consigne ni date limite</span>}
                        </div>
                    )}
                </div>
                {!editing && (
                    <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setEditing(true)} title="Modifier la consigne" aria-label="Modifier la consigne" className="flex h-8 w-8 items-center justify-center rounded-lg text-brass hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={remove} title="Retirer" aria-label="Retirer de la bibliographie" className="flex h-8 w-8 items-center justify-center rounded-lg text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                )}
            </div>
            {editing && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_170px_auto]">
                    <input value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} maxLength={500} placeholder="Consigne (ex. lire le chapitre 2 avant le TD)" aria-label="Consigne" className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm" />
                    <input type="date" min={today()} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Date limite" className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                        <button type="button" onClick={save} className="btn-primary !py-2">Enregistrer</button>
                        <button type="button" onClick={() => setEditing(false)} className="btn-secondary !py-2" aria-label="Annuler"><X className="h-4 w-4" /></button>
                    </div>
                </div>
            )}
        </li>
    );
}

// Suivi anonyme : lu en entier, commencé, jamais ouvert ; rappel aux étudiants qui n'ont pas ouvert.
function ProgressTab({ list }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const load = () => api.getCourseListProgress(list.id).then(setData);
    useEffect(() => { load().catch(() => setData({ error: true })); }, [list.id, list.items.length]);

    async function remind(row) {
        const r = await api.remindCourseListItem(list.id, row.item_id);
        toast(r.sent ? `Rappel envoyé à ${r.sent} étudiant${r.sent > 1 ? "s" : ""}.` : "Tous les étudiants ont déjà ouvert ce document.");
    }

    if (!data) return <p className="text-sm text-slate-500">Chargement…</p>;
    if (data.error) return <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Impossible de charger le suivi.</p>;
    if (data.hidden) {
        return (
            <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
                La classe compte {data.audience_count} étudiant{data.audience_count > 1 ? "s" : ""}. Le suivi s’affiche à partir de 5 étudiants,
                pour qu’on ne puisse pas reconnaître qui a lu quoi.
            </p>
        );
    }
    if (!data.items.length) return <p className="text-sm text-slate-500">Ajoutez des documents pour suivre leur lecture.</p>;

    const pct = (n) => Math.round((n / data.audience_count) * 100);

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600">{data.audience_count} étudiants dans la classe.</p>
            {data.items.map((row) => (
                <div key={row.item_id} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-semibold">{row.document?.title}</p>
                            {row.due_date && <p className="text-xs text-slate-500">À lire avant le {formatDate(row.due_date)}</p>}
                        </div>
                        {row.never > 0 && (
                            <button type="button" onClick={() => remind(row).catch((e) => toast(e?.data?.message || "Envoi impossible."))} className="btn-secondary !py-1.5">
                                <BellRing className="h-3.5 w-3.5" /> Rappeler les {row.never} qui ne l’ont pas ouvert
                            </button>
                        )}
                    </div>
                    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${row.done} lus en entier, ${row.started} commencés, ${row.never} jamais ouverts`}>
                        <span className="bg-emerald-600" style={{ width: `${pct(row.done)}%` }} />
                        <span className="bg-amber-500" style={{ width: `${pct(row.started)}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" />Lu en entier : <b>{row.done}</b> ({pct(row.done)} %)</span>
                        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />Commencé : <b>{row.started}</b></span>
                        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />Jamais ouvert : <b>{row.never}</b></span>
                    </div>
                </div>
            ))}
            <p className="flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Chiffres anonymes : vous ne voyez pas qui a lu ou non. Les rappels sont envoyés directement aux étudiants concernés.
            </p>
        </div>
    );
}

function SettingsTab({ list, onSaved }) {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const toast = useToast();
    const [classes, setClasses] = useState([]);
    const [form, setForm] = useState({ title: list.title, description: list.description || "", school: list.school, level: list.level, filiere: list.filiere || "" });
    const [error, setError] = useState(null);

    useEffect(() => { api.getCourseLists().then((d) => setClasses(d.classes)).catch(() => {}); }, []);

    async function save(e) {
        e.preventDefault();
        setError(null);
        try {
            onSaved(await api.updateCourseList(list.id, { ...form, filiere: form.filiere.trim() || null }));
            toast("Bibliographie enregistrée.");
        } catch (err) {
            setError(err?.data?.message || "Enregistrement impossible.");
        }
    }

    async function remove() {
        if (!(await confirm({ title: `Supprimer la bibliographie « ${list.title} » ?`, message: "Les étudiants ne la verront plus.", danger: true }))) return;
        await api.deleteCourseList(list.id);
        navigate("/mes-cours");
    }

    return (
        <form onSubmit={save} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
                Titre du cours
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
                Présentation
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal" />
            </label>
            <AudienceFields classes={classes} value={form} onChange={setForm} />
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}
            <div className="flex flex-wrap justify-between gap-3">
                <button type="button" onClick={remove} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" /> Supprimer la bibliographie
                </button>
                <button type="submit" className="btn-primary">Enregistrer</button>
            </div>
        </form>
    );
}

// Enseignant : une bibliographie de cours (lectures, suivi de la classe, réglages).
export default function CourseListPage() {
    const { id } = useParams();
    const [list, setList] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("lectures");

    const load = () => api.getCourseList(id).then((l) => { setList(l); setError(null); });
    useEffect(() => { load().catch((e) => setError(e?.status === 403 || e?.status === 404 ? "Bibliographie introuvable." : "Impossible de charger la bibliographie.")); }, [id]);
    usePageRefresh(load);

    if (error) return <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
    if (!list) return <p className="text-sm text-slate-500">Chargement…</p>;

    return (
        <div>
            <Link to="/mes-cours" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brass hover:text-brass-deep">
                <ArrowLeft className="h-4 w-4" /> Mes bibliographies
            </Link>
            <h2 className="font-display text-xl font-extrabold">{list.title}</h2>
            <p className="mt-1 text-sm text-slate-600">
                {audienceLabel(list)} · {list.audience_count} étudiant{list.audience_count > 1 ? "s" : ""} concerné{list.audience_count > 1 ? "s" : ""}
            </p>
            {list.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{list.description}</p>}

            <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.key}
                        onClick={() => setTab(t.key)}
                        className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold ${tab === t.key ? "border-brass text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="mt-5">
                {tab === "lectures" && (
                    <div className="space-y-4">
                        <AddDocument list={list} onAdded={setList} />
                        {list.items.length === 0 ? (
                            <p className="text-sm text-slate-500">Aucune lecture pour le moment. Recherchez un document ci-dessus pour l’ajouter.</p>
                        ) : (
                            <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-4">
                                {list.items.map((item) => <ItemRow key={item.id} list={list} item={item} onChanged={setList} />)}
                            </ul>
                        )}
                    </div>
                )}
                {tab === "suivi" && <ProgressTab list={list} />}
                {tab === "reglages" && <SettingsTab list={list} onSaved={setList} />}
            </div>
        </div>
    );
}
