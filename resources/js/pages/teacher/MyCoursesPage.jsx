import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpenCheck, ChevronRight, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import { usePageRefresh } from "../../context/RefreshContext";
import AudienceFields from "./AudienceFields";

const EMPTY = { title: "", description: "", school: "", level: "", filiere: "" };

export function audienceLabel(list) {
    return `${list.school} · ${list.level}${list.filiere ? ` · ${list.filiere}` : ""}`;
}

// Enseignant : ses bibliographies de cours et la création d'une nouvelle.
export default function MyCoursesPage() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState(null);

    const load = () => api.getCourseLists().then((d) => { setData(d); setError(null); });
    useEffect(() => { load().catch(() => setError("Impossible de charger vos bibliographies.")); }, []);
    usePageRefresh(load);

    async function create(e) {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            const list = await api.createCourseList({ ...form, filiere: form.filiere.trim() || null });
            navigate(`/mes-cours/${list.id}`);
        } catch (err) {
            setFormError(err?.data?.message || "Création impossible. Réessayez.");
            setSaving(false);
        }
    }

    return (
        <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <BookOpenCheck className="h-5 w-5 text-brass" /> Mes bibliographies de cours
                </h2>
                {!creating && (
                    <button type="button" onClick={() => setCreating(true)} className="btn-primary">
                        <Plus className="h-4 w-4" /> Nouvelle bibliographie
                    </button>
                )}
            </div>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Recommandez des documents du catalogue à une de vos classes. Les étudiants de la classe la reçoivent sur leur
                tableau de bord, avec vos consignes et dates limites.
            </p>

            {creating && data && (
                <form onSubmit={create} className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold">Nouvelle bibliographie</h3>
                        <button type="button" onClick={() => { setCreating(false); setForm(EMPTY); }} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Annuler">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <label className="block text-sm font-semibold text-slate-700">
                        Titre du cours
                        <input
                            required
                            autoFocus
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            placeholder="Ex. Analyse mathématique I"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal"
                        />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                        Présentation <span className="font-normal text-slate-500">(facultatif)</span>
                        <textarea
                            rows={2}
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Ex. Lectures du semestre 1, à faire avant chaque TD."
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal"
                        />
                    </label>
                    <AudienceFields classes={data.classes} value={form} onChange={setForm} />
                    {formError && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{formError}</p>}
                    <div className="flex justify-end">
                        <button type="submit" disabled={saving || !data.classes.length} className="btn-primary disabled:opacity-50">
                            {saving ? "Création…" : "Créer et ajouter des documents"}
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            {data === null ? (
                !error && <p className="text-sm text-slate-500">Chargement…</p>
            ) : data.lists.length === 0 ? (
                !creating && (
                    <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                        Vous n’avez pas encore de bibliographie. Créez-en une pour recommander des lectures à une classe.
                        {data.classes.length === 0 && <span className="mt-2 block text-amber-700">Aucune classe ne vous est encore attribuée par le Service Numérique.</span>}
                    </div>
                )
            ) : (
                <div className="space-y-3">
                    {data.lists.map((list) => (
                        <Link key={list.id} to={`/mes-cours/${list.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 hover:border-brass">
                            <div className="min-w-0">
                                <p className="font-semibold">{list.title}</p>
                                <p className="text-xs text-slate-500">
                                    {audienceLabel(list)} · {list.items_count} document{list.items_count > 1 ? "s" : ""} · {list.audience_count} étudiant{list.audience_count > 1 ? "s" : ""}
                                </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
