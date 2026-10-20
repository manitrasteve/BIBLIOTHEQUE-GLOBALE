import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, UploadCloud, FileText, Tag, FolderOpen, AlignLeft, BookOpenCheck, Send, FileCheck2, Plus, ArrowLeft, ImageIcon, X, BookOpen, ListChecks, FlaskConical, CalendarDays, GraduationCap, MoreHorizontal } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";
import SortTh from "../../components/SortTh";
import { sortRows } from "../../lib/sort";
import RichTextEditor from "../../components/RichTextEditor";

const TYPES = ["Polycopié", "Travaux dirigés", "Travaux pratiques", "Annales", "Cours", "Autre"];
const OTHER = "__autre__";
// Icône de chaque type (tuiles du formulaire).
const TYPE_ICONS = { "Polycopié": BookOpen, "Travaux dirigés": ListChecks, "Travaux pratiques": FlaskConical, "Annales": CalendarDays, "Cours": GraduationCap, "Autre": MoreHorizontal };
const EMPTY = { title: "", type: "Polycopié", typeOther: "", category: "", categoryOther: "", abstract: "", course_list_id: "" };
// Limite du serveur (règle « cover » de TeacherSubmissionController).
const MAX_COVER_BYTES = 5 * 1024 * 1024;
// Limite du serveur (règle « file » de TeacherSubmissionController).
const MAX_PDF_BYTES = 50 * 1024 * 1024;

// Résumé de l'éditeur : « <p></p> » quand il est vide.
const hasText = (html) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";

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
    const [options, setOptions] = useState({ categories: [], lists: [] });
    const [form, setForm] = useState(EMPTY);
    const [file, setFile] = useState(null);
    const [cover, setCover] = useState(null);
    const [coverPreview, setCoverPreview] = useState(null);
    const [sending, setSending] = useState(false);
    const [formError, setFormError] = useState(null);
    const [fileKey, setFileKey] = useState(0);
    const [showForm, setShowForm] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [sort, setSort] = useState({ key: "created_at", dir: "desc" });

    const load = () => api.getTeacherSubmissions().then((d) => { setItems(d); setError(null); });
    useEffect(() => {
        load().catch(() => setError("Impossible de charger vos dépôts."));
        Promise.all([api.getCategories().catch(() => []), api.getCourseLists().catch(() => ({ lists: [] }))])
            .then(([categories, courses]) => {
                setOptions({ categories: Array.isArray(categories) ? categories : categories?.data || [], lists: courses.lists || [] });
            });
    }, []);
    usePageRefresh(load);

    // Aperçu de la couverture choisie (URL locale libérée au changement).
    useEffect(() => {
        if (!cover) {
            setCoverPreview(null);
            return undefined;
        }
        const url = URL.createObjectURL(cover);
        setCoverPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [cover]);

    function pickCover(picked) {
        if (!picked) return;
        if (picked.size > MAX_COVER_BYTES) {
            setFormError("La couverture dépasse 5 Mo. Choisissez une image plus légère.");
            return;
        }
        setFormError(null);
        setCover(picked);
    }

    function pickFile(picked) {
        if (!picked) return;
        if (picked.size > MAX_PDF_BYTES) {
            setFormError("Le PDF dépasse 50 Mo. Choisissez un fichier plus léger.");
            return;
        }
        setFormError(null);
        setFile(picked);
    }

    async function submit(e) {
        e.preventDefault();
        if (!file) return setFormError("Choisissez le fichier PDF à déposer.");

        // « Autre » : la valeur réelle vient du champ libre.
        const type = form.type === "Autre" ? form.typeOther.trim() : form.type;
        const category = form.category === OTHER ? form.categoryOther.trim() : form.category;
        if (!type) return setFormError("Précisez le type du document.");
        if (!category) return setFormError("Précisez la catégorie du document.");

        setSending(true);
        setFormError(null);
        try {
            const body = new FormData();
            body.append("title", form.title);
            body.append("type", type);
            body.append("category", category);
            if (hasText(form.abstract)) body.append("abstract", form.abstract);
            if (form.course_list_id !== "") body.append("course_list_id", form.course_list_id);
            body.append("file", file);
            if (cover) body.append("cover", cover);
            const doc = await api.createTeacherSubmission(body);
            setItems((current) => [doc, ...(current || [])]);
            setForm(EMPTY);
            setFile(null);
            setCover(null);
            setFileKey((k) => k + 1);
            setShowForm(false);
            toast("Dépôt envoyé. Le Service Numérique va le vérifier.");
        } catch (err) {
            const errors = err?.data?.errors;
            setFormError(errors ? Object.values(errors).flat()[0] : err?.data?.message || "Envoi impossible. Réessayez.");
        } finally {
            setSending(false);
        }
    }

    const field = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200";
    const labelRow = "mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink";
    const panel = "space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5";
    const panelTitle = "text-xs font-bold uppercase tracking-wider text-ink-soft";
    const fileSize = file ? `${(file.size / 1048576).toFixed(1)} Mo` : "";

    const getVal = (doc, key) => (key === "category" ? doc.category?.name : doc[key]) ?? "";
    const rows = sortRows(items || [], sort, getVal);
    const onResubmitDone = (d) => setItems((list) => list.map((x) => (x.id === d.id ? { ...x, ...d } : x)));

    return (
        <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <UploadCloud className="h-5 w-5 text-brass" /> Mes dépôts
                </h2>
                {showForm ? (
                    <button type="button" onClick={() => { setShowForm(false); setFormError(null); }} className="btn-secondary">
                        <ArrowLeft className="h-4 w-4" /> Retour à la liste
                    </button>
                ) : (
                    <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
                        <Plus className="h-4 w-4" /> Nouveau dépôt
                    </button>
                )}
            </div>

            {showForm ? (
            <form onSubmit={submit} className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-4">
                    <section className={panel}>
                        <h3 className={panelTitle}>Le document</h3>
                        <div>
                            <label htmlFor="submission-title" className={labelRow}><FileText className="h-4 w-4 text-brass" aria-hidden="true" /> Titre</label>
                            <input id="submission-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. TD n°3 : limites et continuité" className={field} />
                        </div>

                        <div>
                            <span className={labelRow}><Tag className="h-4 w-4 text-brass" aria-hidden="true" /> Type</span>
                            <div role="radiogroup" aria-label="Type" className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {TYPES.map((t) => {
                                    const Icon = TYPE_ICONS[t];
                                    const selected = form.type === t;
                                    return (
                                        <label
                                            key={t}
                                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-indigo-200 ${
                                                selected ? "border-indigo-400 bg-indigo-100 text-ink" : "border-line text-ink-soft hover:border-indigo-400"
                                            }`}
                                        >
                                            <input type="radio" name="submission-type" value={t} checked={selected} onChange={() => setForm({ ...form, type: t })} className="sr-only" />
                                            <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-indigo-400" : ""}`} aria-hidden="true" />
                                            <span className="min-w-0">{t}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {form.type === "Autre" && (
                                <input required autoFocus value={form.typeOther} onChange={(e) => setForm({ ...form, typeOther: e.target.value })} placeholder="Précisez le type" aria-label="Précisez le type" className={field} />
                            )}
                        </div>

                        <div>
                            <label htmlFor="submission-category" className={labelRow}><FolderOpen className="h-4 w-4 text-brass" aria-hidden="true" /> Catégorie</label>
                            <select id="submission-category" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field}>
                                <option value="">Choisir…</option>
                                {options.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                <option value={OTHER}>Autre…</option>
                            </select>
                            {form.category === OTHER && (
                                <input required value={form.categoryOther} onChange={(e) => setForm({ ...form, categoryOther: e.target.value })} placeholder="Ex. Mathématiques" aria-label="Précisez la catégorie" className={field} />
                            )}
                        </div>

                        <div>
                            <span className={labelRow}><AlignLeft className="h-4 w-4 text-brass" aria-hidden="true" /> Résumé <span className="font-normal text-ink-soft">(facultatif)</span></span>
                            <div className="mt-1.5">
                                <RichTextEditor value={form.abstract} onChange={(html) => setForm((prev) => ({ ...prev, abstract: html }))} />
                            </div>
                        </div>
                    </section>

                    <section className={panel}>
                        <h3 className={panelTitle}>Fichier PDF <span className="normal-case tracking-normal">(50 Mo maximum)</span></h3>
                        <label
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragging(false);
                                const dropped = e.dataTransfer.files?.[0];
                                if (dropped?.type === "application/pdf") pickFile(dropped);
                            }}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-indigo-200 ${
                                file
                                    ? "border-solid border-emerald-300 bg-emerald-50"
                                    : dragging
                                      ? "border-dashed border-indigo-400 bg-indigo-100"
                                      : "border-dashed border-line bg-paper hover:border-indigo-400"
                            }`}
                        >
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${file ? "bg-surface text-emerald-700" : "bg-paper-dim text-indigo-400"}`}>
                                {file ? <FileCheck2 className="h-5 w-5" aria-hidden="true" /> : <UploadCloud className="h-5 w-5" aria-hidden="true" />}
                            </span>
                            <span className="grid min-w-0 flex-1">
                                <span className="truncate text-sm font-semibold text-ink">{file ? file.name : "Glissez le PDF ici"}</span>
                                <span className="text-xs text-ink-soft">{file ? `${fileSize} · cliquer pour changer` : "ou cliquez pour choisir"}</span>
                            </span>
                            <input key={fileKey} type="file" accept="application/pdf" required={!file} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                        </label>
                    </section>

                    {options.lists.length > 0 && (
                        <section className={panel}>
                            <h3 className={panelTitle}>Diffusion</h3>
                            <div>
                                <label htmlFor="submission-list" className={labelRow}><BookOpenCheck className="h-4 w-4 text-brass" aria-hidden="true" /> Ajouter à ma bibliographie après publication <span className="font-normal text-ink-soft">(facultatif)</span></label>
                                <select id="submission-list" value={form.course_list_id} onChange={(e) => setForm({ ...form, course_list_id: e.target.value })} className={field}>
                                    <option value="">Ne pas ajouter</option>
                                    {options.lists.map((l) => <option key={l.id} value={l.id}>{l.title} ({l.school} · {l.level})</option>)}
                                </select>
                            </div>
                        </section>
                    )}
                </div>

                <aside className="min-w-0 space-y-4">

                    <section className={panel}>
                        <h3 className={panelTitle}>Photo de couverture <span className="normal-case tracking-normal">(facultatif)</span></h3>
                        <div className="flex items-start gap-3">
                            {coverPreview ? (
                                <img src={coverPreview} alt="Aperçu de la couverture" className="aspect-3/4 w-24 shrink-0 rounded-lg border border-line object-cover" />
                            ) : (
                                <div className="flex aspect-3/4 w-24 shrink-0 flex-col justify-end rounded-lg bg-indigo-600 p-2.5 text-white" aria-label="Aperçu sans couverture">
                                    <span className="line-clamp-4 text-xs font-extrabold leading-snug">{form.title.trim() || "Titre du document"}</span>
                                    <span className="mt-1 text-[10px] text-on-primary-soft">{form.type === "Autre" ? form.typeOther.trim() || "Autre" : form.type}</span>
                                </div>
                            )}
                            <div className="min-w-0 space-y-2">
                                <label className="btn-secondary cursor-pointer focus-within:ring-2 focus-within:ring-indigo-200">
                                    <ImageIcon className="h-4 w-4" aria-hidden="true" /> {cover ? "Changer l’image" : "Choisir une image"}
                                    <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
                                </label>
                                {cover && (
                                    <button type="button" onClick={() => setCover(null)} className="flex items-center gap-1 text-xs font-semibold text-red-700">
                                        <X className="h-3.5 w-3.5" aria-hidden="true" /> Retirer la couverture
                                    </button>
                                )}
                                <p className="text-xs text-ink-soft">
                                    {cover ? `${cover.name} · ${(cover.size / 1048576).toFixed(1)} Mo` : "JPG, PNG ou WebP, 5 Mo maximum. Sans image, le Service Numérique pourra en ajouter une."}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className={`${panel} lg:sticky lg:top-4`}>
                        <h3 className={panelTitle}>Après l’envoi</h3>
                        <ol className="space-y-3">
                            {[
                                ["Envoi", "Votre dépôt part au Service Numérique."],
                                ["Vérification", "Le Service Numérique contrôle le document."],
                                ["Publication", "Vous êtes notifié de la publication, ou du motif s’il faut le corriger."],
                            ].map(([title, text], i) => (
                                <li key={title} className="flex gap-3">
                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${i === 0 ? "bg-indigo-600 text-white" : "bg-paper-dim text-ink-soft"}`} aria-hidden="true">{i + 1}</span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold text-ink">{title}</span>
                                        <span className="block text-xs text-ink-soft">{text}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>

                        {formError && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{formError}</p>}

                        <button type="submit" disabled={sending} className="btn-primary w-full py-2.5! disabled:opacity-50">
                            <Send className="h-4 w-4" aria-hidden="true" /> {sending ? "Envoi…" : "Envoyer au Service Numérique"}
                        </button>
                    </section>
                </aside>
            </form>
            ) : (
            <>
            {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {items === null ? (
                !error && <p className="text-sm text-slate-500">Chargement…</p>
            ) : rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-slate-500">
                    Vous n’avez encore rien déposé. Cliquez sur « Nouveau dépôt » pour commencer.
                </p>
            ) : (
                <>
                {/* Desktop : tableau triable */}
                <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface sm:block">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50"><tr>
                            <SortTh label="Titre" sortKey="title" sort={sort} setSort={setSort} />
                            <SortTh label="Type" sortKey="type" sort={sort} setSort={setSort} />
                            <SortTh label="Catégorie" sortKey="category" sort={sort} setSort={setSort} />
                            <SortTh label="Statut" sortKey="status" sort={sort} setSort={setSort} />
                            <SortTh label="Déposé le" sortKey="created_at" sort={sort} setSort={setSort} />
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr></thead>
                        <tbody>
                            {rows.map((doc) => {
                                const state = submissionState(doc);
                                return (
                                    <tr key={doc.id} className="border-t border-slate-100 align-top">
                                        <td className="px-4 py-3">
                                            {doc.status === "publie" ? (
                                                <Link to={`/documents/${doc.slug}`} className="font-semibold hover:text-brass-deep">{doc.title}</Link>
                                            ) : (
                                                <p className="font-semibold">{doc.title}</p>
                                            )}
                                            {doc.status === "refuse" && doc.review_note && (
                                                <p className="mt-1 text-xs text-red-700"><b>Motif :</b> {doc.review_note}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">{doc.type}</td>
                                        <td className="px-4 py-3">{doc.category?.name || "—"}</td>
                                        <td className="px-4 py-3"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${state.cls}`}>{state.label}</span></td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {formatDate(doc.created_at)}
                                            {doc.status === "publie" && <span className="block text-xs text-slate-500">publié le {formatDate(doc.published_at)} · {doc.consultations_count ?? 0} consultation{(doc.consultations_count ?? 0) > 1 ? "s" : ""}</span>}
                                            {doc.status === "programme" && doc.scheduled_at && <span className="block text-xs text-slate-500">en ligne le {formatDate(doc.scheduled_at)}</span>}
                                        </td>
                                        <td className="px-4 py-3"><div className="flex justify-end">{doc.status === "refuse" && <ResubmitButton doc={doc} onDone={onResubmitDone} />}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile : cartes */}
                <ul className="space-y-3 sm:hidden">
                    {rows.map((doc) => {
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
                                            {doc.type}{doc.category?.name ? ` · ${doc.category.name}` : ""} · déposé le {formatDate(doc.created_at)}
                                            {doc.status === "publie" && ` · publié le ${formatDate(doc.published_at)} · ${doc.consultations_count ?? 0} consultation${(doc.consultations_count ?? 0) > 1 ? "s" : ""}`}
                                            {doc.status === "programme" && doc.scheduled_at && ` · en ligne le ${formatDate(doc.scheduled_at)}`}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${state.cls}`}>{state.label}</span>
                                </div>
                                {doc.status === "refuse" && (
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                                        <span><b>Motif :</b> {doc.review_note}</span>
                                        <ResubmitButton doc={doc} onDone={onResubmitDone} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
                </>
            )}
            </>
            )}
        </div>
    );
}
