import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, UploadCloud, FileText, Tag, FolderOpen, AlignLeft, BookOpenCheck, Send, FileCheck2, Plus, ArrowLeft, ImageIcon, X } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";
import SortTh from "../../components/SortTh";
import { sortRows } from "../../lib/sort";
import RichTextEditor from "../../components/RichTextEditor";

const TYPES = ["Polycopié", "Travaux dirigés", "Travaux pratiques", "Annales", "Cours", "Autre"];
const OTHER = "__autre__";
const EMPTY = { title: "", type: "Polycopié", typeOther: "", category: "", categoryOther: "", abstract: "", course_list_id: "" };
// Limite du serveur (règle « cover » de TeacherSubmissionController).
const MAX_COVER_BYTES = 5 * 1024 * 1024;

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

    const field = "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brass focus:ring-2 focus:ring-indigo-200";
    const labelRow = "mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700";
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
            <>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Polycopié, TD, annales… Le Service Numérique vérifie votre document puis le publie dans le catalogue.
                Vous êtes notifié de la publication, ou du motif s’il faut le corriger.
            </p>

            <form onSubmit={submit} className="mb-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <div className="flex items-center gap-3 border-b border-line bg-indigo-50 px-5 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brass shadow-sm">
                        <FileCheck2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-display text-base font-extrabold leading-tight">Nouveau dépôt</p>
                        <p className="text-xs text-slate-500">Renseignez les informations puis joignez le PDF.</p>
                    </div>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                    <div>
                        <span className={labelRow}><FileText className="h-4 w-4 text-brass" /> Titre</span>
                        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. TD n°3 : limites et continuité" className={field} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <span className={labelRow}><Tag className="h-4 w-4 text-brass" /> Type</span>
                            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={field}>
                                {TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                            {form.type === "Autre" && (
                                <input required value={form.typeOther} onChange={(e) => setForm({ ...form, typeOther: e.target.value })} placeholder="Précisez le type" className={field} />
                            )}
                        </div>
                        <div>
                            <span className={labelRow}><FolderOpen className="h-4 w-4 text-brass" /> Catégorie</span>
                            <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field}>
                                <option value="">Choisir…</option>
                                {options.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                <option value={OTHER}>Autre…</option>
                            </select>
                            {form.category === OTHER && (
                                <input required value={form.categoryOther} onChange={(e) => setForm({ ...form, categoryOther: e.target.value })} placeholder="Ex. Mathématiques" className={field} />
                            )}
                        </div>
                    </div>

                    <div>
                        <span className={labelRow}><AlignLeft className="h-4 w-4 text-brass" /> Résumé <span className="font-normal text-slate-500">(facultatif)</span></span>
                        <div className="mt-1.5">
                            <RichTextEditor value={form.abstract} onChange={(html) => setForm((prev) => ({ ...prev, abstract: html }))} />
                        </div>
                    </div>

                    <div>
                        <span className={labelRow}><ImageIcon className="h-4 w-4 text-brass" /> Photo de couverture <span className="font-normal text-slate-500">(facultatif)</span></span>
                        <div className="mt-1.5 flex flex-wrap items-center gap-4">
                            {coverPreview ? (
                                <img src={coverPreview} alt="Aperçu de la couverture" className="h-32 w-24 shrink-0 rounded-lg border border-line object-cover shadow-sm" />
                            ) : (
                                <span className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line text-slate-400">
                                    <ImageIcon className="h-7 w-7" aria-hidden="true" />
                                </span>
                            )}
                            <div className="min-w-0 space-y-2">
                                <label className="btn-secondary cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-brass)]">
                                    <ImageIcon className="h-4 w-4" /> {cover ? "Changer l’image" : "Choisir une image"}
                                    <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
                                </label>
                                {cover && (
                                    <button type="button" onClick={() => setCover(null)} className="flex items-center gap-1 text-xs font-semibold text-red-700">
                                        <X className="h-3.5 w-3.5" /> Retirer la couverture
                                    </button>
                                )}
                                <p className="text-xs text-slate-500">
                                    {cover ? `${cover.name} · ${(cover.size / 1048576).toFixed(1)} Mo` : "JPG, PNG ou WebP, 5 Mo maximum. Sans image, le Service Numérique pourra en ajouter une."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <span className={labelRow}><UploadCloud className="h-4 w-4 text-brass" /> Fichier PDF <span className="font-normal text-slate-500">(50 Mo maximum)</span></span>
                        <label className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition ${file ? "border-brass bg-indigo-50" : "border-line hover:border-brass hover:bg-indigo-50/50"}`}>
                            {file ? (
                                <>
                                    <FileCheck2 className="h-7 w-7 text-brass" />
                                    <span className="text-sm font-semibold text-slate-900">{file.name}</span>
                                    <span className="text-xs text-slate-500">{fileSize} · Cliquez pour remplacer</span>
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="h-7 w-7 text-slate-400" />
                                    <span className="text-sm font-semibold text-slate-700">Choisir un fichier PDF</span>
                                    <span className="text-xs text-slate-500">ou glissez-le ici</span>
                                </>
                            )}
                            <input key={fileKey} type="file" accept="application/pdf" required className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </label>
                    </div>

                    {options.lists.length > 0 && (
                        <div>
                            <span className={labelRow}><BookOpenCheck className="h-4 w-4 text-brass" /> Ajouter à ma bibliographie après publication <span className="font-normal text-slate-500">(facultatif)</span></span>
                            <select value={form.course_list_id} onChange={(e) => setForm({ ...form, course_list_id: e.target.value })} className={field}>
                                <option value="">Ne pas ajouter</option>
                                {options.lists.map((l) => <option key={l.id} value={l.id}>{l.title} ({l.school} · {l.level})</option>)}
                            </select>
                        </div>
                    )}

                    {formError && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{formError}</p>}
                </div>

                <div className="flex justify-end border-t border-line bg-slate-50 px-5 py-4">
                    <button type="submit" disabled={sending} className="btn-primary disabled:opacity-50">
                        <Send className="h-4 w-4" /> {sending ? "Envoi…" : "Envoyer au Service Numérique"}
                    </button>
                </div>
            </form>
            </>
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
