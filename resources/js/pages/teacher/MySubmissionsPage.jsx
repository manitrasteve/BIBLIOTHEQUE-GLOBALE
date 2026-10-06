import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, UploadCloud } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";

const TYPES = ["Polycopié", "Travaux dirigés", "Travaux pratiques", "Annales", "Cours", "Autre"];
const EMPTY = { title: "", type: "Polycopié", category: "", library_id: "", abstract: "", course_list_id: "" };

// État d'un dépôt vu par l'enseignant.
function submissionState(doc) {
    if (doc.status === "publie") return { label: "Publié", cls: "bg-green-100 text-green-700" };
    if (doc.status === "refuse") return { label: "À corriger", cls: "bg-red-100 text-red-700" };
    if (doc.status === "programme") return { label: "Publication programmée", cls: "bg-amber-100 text-amber-700" };
    if (doc.status === "archive") return { label: "Archivé", cls: "bg-slate-100 text-slate-600" };
    return { label: "En vérification", cls: "bg-amber-100 text-amber-700" };
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

// Renvoi d'un PDF corrigé pour un dépôt refusé.
function ResubmitButton({ doc, onDone }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    async function send(file) {
        if (!file) return;
        setBusy(true);
        try {
            const body = new FormData();
            body.append("file", file);
            onDone(await api.resubmitTeacherSubmission(doc.id, body));
            toast("PDF corrigé envoyé au Service Numérique.");
        } catch (e) {
            toast(e?.data?.errors?.file?.[0] || e?.data?.message || "Envoi impossible.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <label className={`btn-secondary cursor-pointer !py-1.5 ${busy ? "opacity-50" : ""}`}>
            <FileUp className="h-3.5 w-3.5" /> {busy ? "Envoi…" : "Envoyer un PDF corrigé"}
            <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => send(e.target.files?.[0])} />
        </label>
    );
}

// Enseignant : déposer un support de cours (vérifié par le Service Numérique avant publication) et suivre ses dépôts.
export default function MySubmissionsPage() {
    const toast = useToast();
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    const [options, setOptions] = useState({ categories: [], libraries: [], lists: [] });
    const [form, setForm] = useState(EMPTY);
    const [file, setFile] = useState(null);
    const [sending, setSending] = useState(false);
    const [formError, setFormError] = useState(null);
    const [fileKey, setFileKey] = useState(0);

    const load = () => api.getTeacherSubmissions().then((d) => { setItems(d); setError(null); });
    useEffect(() => {
        load().catch(() => setError("Impossible de charger vos dépôts."));
        Promise.all([api.getCategories().catch(() => []), api.getLibraries().catch(() => []), api.getCourseLists().catch(() => ({ lists: [] }))])
            .then(([categories, libraries, courses]) => {
                const libs = Array.isArray(libraries) ? libraries : libraries?.data || [];
                setOptions({ categories: Array.isArray(categories) ? categories : categories?.data || [], libraries: libs, lists: courses.lists || [] });
                if (libs.length === 1) setForm((f) => ({ ...f, library_id: String(libs[0].id) }));
            });
    }, []);
    usePageRefresh(load);

    async function submit(e) {
        e.preventDefault();
        if (!file) return setFormError("Choisissez le fichier PDF à déposer.");
        setSending(true);
        setFormError(null);
        try {
            const body = new FormData();
            Object.entries(form).forEach(([k, v]) => v !== "" && body.append(k, v));
            body.append("file", file);
            const doc = await api.createTeacherSubmission(body);
            setItems((current) => [doc, ...(current || [])]);
            setForm((f) => ({ ...EMPTY, library_id: f.library_id }));
            setFile(null);
            setFileKey((k) => k + 1);
            toast("Dépôt envoyé. Le Service Numérique va le vérifier.");
        } catch (err) {
            const errors = err?.data?.errors;
            setFormError(errors ? Object.values(errors).flat()[0] : err?.data?.message || "Envoi impossible. Réessayez.");
        } finally {
            setSending(false);
        }
    }

    const field = "mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal";

    return (
        <div>
            <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-extrabold">
                <UploadCloud className="h-5 w-5 text-brass" /> Déposer un support de cours
            </h2>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Polycopié, TD, annales… Le Service Numérique vérifie votre document puis le publie dans le catalogue.
                Vous êtes notifié de la publication, ou du motif s’il faut le corriger.
            </p>

            <form onSubmit={submit} className="mb-8 space-y-4 rounded-2xl border border-line bg-surface p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-slate-700">
                        Titre
                        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. TD n°3 : limites et continuité" className={field} />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                        Type
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={field}>
                            {TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                        Catégorie
                        <input required list="submission-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex. Mathématiques" className={field} />
                        <datalist id="submission-categories">
                            {options.categories.map((c) => <option key={c.id} value={c.name} />)}
                        </datalist>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                        Bibliothèque
                        <select required value={form.library_id} onChange={(e) => setForm({ ...form, library_id: e.target.value })} className={field}>
                            <option value="">Choisir…</option>
                            {options.libraries.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </label>
                </div>
                <label className="block text-sm font-semibold text-slate-700">
                    Résumé <span className="font-normal text-slate-500">(facultatif)</span>
                    <textarea rows={2} value={form.abstract} onChange={(e) => setForm({ ...form, abstract: e.target.value })} className={field} />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                    Fichier PDF <span className="font-normal text-slate-500">(50 Mo maximum)</span>
                    <input key={fileKey} type="file" accept="application/pdf" required onChange={(e) => setFile(e.target.files?.[0] || null)} className={`${field} file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold`} />
                </label>
                {options.lists.length > 0 && (
                    <label className="block text-sm font-semibold text-slate-700">
                        Après publication, ajouter à ma bibliographie <span className="font-normal text-slate-500">(facultatif)</span>
                        <select value={form.course_list_id} onChange={(e) => setForm({ ...form, course_list_id: e.target.value })} className={field}>
                            <option value="">Ne pas ajouter</option>
                            {options.lists.map((l) => <option key={l.id} value={l.id}>{l.title} ({l.school} · {l.level})</option>)}
                        </select>
                    </label>
                )}
                {formError && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{formError}</p>}
                <div className="flex justify-end">
                    <button type="submit" disabled={sending} className="btn-primary disabled:opacity-50">
                        {sending ? "Envoi…" : "Envoyer au Service Numérique"}
                    </button>
                </div>
            </form>

            <h3 className="mb-3 font-bold">Mes dépôts</h3>
            {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {items === null ? (
                !error && <p className="text-sm text-slate-500">Chargement…</p>
            ) : items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-slate-500">Vous n’avez encore rien déposé.</p>
            ) : (
                <ul className="space-y-3">
                    {items.map((doc) => {
                        const state = submissionState(doc);
                        return (
                            <li key={doc.id} className="rounded-xl border border-line bg-surface p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        {doc.status === "publie" ? (
                                            <Link to={`/documents/${doc.slug}`} className="font-semibold hover:text-brass-deep">{doc.title}</Link>
                                        ) : (
                                            <p className="font-semibold">{doc.title}</p>
                                        )}
                                        <p className="text-xs text-slate-500">
                                            {doc.type} · déposé le {formatDate(doc.created_at)}
                                            {doc.status === "publie" && ` · publié le ${formatDate(doc.published_at)} · ${doc.consultations_count ?? 0} consultation${(doc.consultations_count ?? 0) > 1 ? "s" : ""}`}
                                            {doc.status === "programme" && doc.scheduled_at && ` · en ligne le ${formatDate(doc.scheduled_at)}`}
                                        </p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state.cls}`}>{state.label}</span>
                                </div>
                                {doc.status === "refuse" && (
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                                        <span><b>Motif :</b> {doc.review_note}</span>
                                        <ResubmitButton doc={doc} onDone={(d) => setItems((list) => list.map((x) => (x.id === d.id ? { ...x, ...d } : x)))} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
