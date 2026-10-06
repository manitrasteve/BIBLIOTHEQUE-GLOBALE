import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, School, Send, X } from "lucide-react";
import { api } from "../../lib/api";
import { useConfirm } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";

const STATUS = {
    en_attente: { label: "En attente", cls: "bg-amber-100 text-amber-700" },
    acceptee: { label: "Acceptée", cls: "bg-green-100 text-green-700" },
    refusee: { label: "Refusée", cls: "bg-red-100 text-red-700" },
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

// Fenêtre « Voir mes classes » : classes attribuées, regroupées par établissement.
function ClassesDialog({ classes, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const bySchool = classes.reduce((acc, c) => ({ ...acc, [c.school]: [...(acc[c.school] || []), c] }), {});

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal="true" aria-labelledby="my-classes-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-lg rounded-2xl bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 id="my-classes-title" className="font-display text-lg font-extrabold">Mes classes</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {classes.length
                                ? `${classes.length} classe${classes.length > 1 ? "s" : ""} attribuée${classes.length > 1 ? "s" : ""} par le Service Numérique.`
                                : "Aucune classe ne vous est encore attribuée."}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="h-4 w-4" /></button>
                </div>
                {classes.length > 0 ? (
                    <div className="mt-4 space-y-3">
                        {Object.entries(bySchool).map(([school, list]) => (
                            <div key={school} className="rounded-xl border border-line p-3">
                                <p className="text-sm font-bold">{school}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {list.map((c) => (
                                        <span key={c.id} className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-brass-deep" title={`Attribuée le ${formatDate(c.created_at)}`}>
                                            {c.level}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Faites une demande ci-dessous pour enseigner dans une classe.</p>
                )}
                <div className="mt-5 flex justify-end">
                    <button type="button" onClick={onClose} className="btn-secondary">Fermer</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

// Enseignant : demander une classe (établissement + niveau) au Service Numérique et suivre ses demandes.
export default function MyClassesPage() {
    const confirm = useConfirm();
    const toast = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ school: "", level: "", message: "" });
    const [sending, setSending] = useState(false);
    const [formError, setFormError] = useState(null);
    const [showClasses, setShowClasses] = useState(false);

    const load = () => api.getMyClassRequests().then((d) => { setData(d); setError(null); });
    useEffect(() => { load().catch(() => setError("Impossible de charger vos classes.")); }, []);
    usePageRefresh(load);

    const assigned = new Set((data?.classes || []).map((c) => `${c.school}|${c.level}`));
    const pending = new Set((data?.requests || []).filter((r) => r.status === "en_attente").map((r) => `${r.school}|${r.level}`));
    const chosen = `${form.school}|${form.level}`;
    const conflict = form.school && form.level
        ? assigned.has(chosen) ? "Cette classe vous est déjà attribuée." : pending.has(chosen) ? "Une demande pour cette classe est déjà en attente." : null
        : null;

    async function submit(e) {
        e.preventDefault();
        if (conflict) return;
        setSending(true);
        setFormError(null);
        try {
            await api.createClassRequest({ ...form, message: form.message.trim() || null });
            toast("Demande envoyée au Service Numérique.");
            setForm({ school: "", level: "", message: "" });
            await load();
        } catch (err) {
            setFormError(err?.data?.message || "Envoi impossible. Réessayez.");
        } finally {
            setSending(false);
        }
    }

    async function cancel(r) {
        if (!(await confirm({ title: `Annuler la demande ${r.school} · ${r.level} ?` }))) return;
        await api.cancelClassRequest(r.id);
        load();
    }

    const field = "mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal";

    return (
        <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <School className="h-5 w-5 text-brass" /> Mes classes
                </h2>
                <button type="button" onClick={() => setShowClasses(true)} disabled={!data} className="btn-secondary disabled:opacity-50">
                    <Eye className="h-4 w-4" /> Voir mes classes{data ? ` (${data.classes.length})` : ""}
                </button>
            </div>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Demandez à enseigner dans une classe (établissement et niveau). Une fois votre demande validée par le Service Numérique,
                vous pourrez adresser des bibliographies de cours aux étudiants de cette classe.
            </p>

            {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            {data && (
                <form onSubmit={submit} className="mb-8 space-y-4 rounded-2xl border border-line bg-surface p-5">
                    <h3 className="font-bold">Demander une classe</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            Établissement
                            <select required value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} className={field}>
                                <option value="">Choisir…</option>
                                {data.schools.map((s) => <option key={s}>{s}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">
                            Niveau
                            <select required value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className={field}>
                                <option value="">Choisir…</option>
                                {data.levels.map((l) => (
                                    <option key={l} value={l}>{l}{assigned.has(`${form.school}|${l}`) ? " (déjà attribuée)" : ""}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className="block text-sm font-semibold text-slate-700">
                        Message au Service Numérique <span className="font-normal text-slate-500">(facultatif)</span>
                        <textarea rows={2} maxLength={1000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Ex. J’assure le cours d’Analyse mathématique I au semestre 1." className={field} />
                    </label>
                    {conflict && <p className="text-sm font-medium text-amber-700">{conflict}</p>}
                    {formError && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{formError}</p>}
                    <div className="flex justify-end">
                        <button type="submit" disabled={sending || !!conflict} className="btn-primary disabled:opacity-50">
                            <Send className="h-4 w-4" /> {sending ? "Envoi…" : "Envoyer la demande"}
                        </button>
                    </div>
                </form>
            )}

            <h3 className="mb-3 font-bold">Mes demandes</h3>
            {data === null ? (
                !error && <p className="text-sm text-slate-500">Chargement…</p>
            ) : data.requests.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-slate-500">Aucune demande pour le moment.</p>
            ) : (
                <ul className="space-y-3">
                    {data.requests.map((r) => (
                        <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold">{r.school} · {r.level}</p>
                                    <p className="text-xs text-slate-500">
                                        Demandée le {formatDate(r.created_at)}{r.processed_at ? ` · traitée le ${formatDate(r.processed_at)}` : ""}
                                    </p>
                                    {r.message && <p className="mt-1 text-sm text-slate-600">« {r.message} »</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[r.status]?.cls}`}>{STATUS[r.status]?.label}</span>
                                    {r.status === "en_attente" && (
                                        <button type="button" onClick={() => cancel(r)} className="text-xs font-semibold text-slate-500 hover:text-red-700">Annuler</button>
                                    )}
                                </div>
                            </div>
                            {r.status === "refusee" && r.reason && (
                                <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-sm text-red-700"><b>Motif :</b> {r.reason}</p>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {showClasses && data && <ClassesDialog classes={data.classes} onClose={() => setShowClasses(false)} />}
        </div>
    );
}
