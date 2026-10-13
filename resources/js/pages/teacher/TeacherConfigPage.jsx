import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal, School, BookOpenCheck, Save, Info, ChevronRight, ArrowLeft } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";

// Enseignant : page d'accueil de configuration (cartes) + gestion des niveaux assurés dans son centre.
export default function TeacherConfigPage() {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState([]);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState("home"); // "home" | "etablissement"

    const load = () =>
        api.getTeacherConfig().then((d) => {
            setData(d);
            setSelected(d.selected || []);
            setError(null);
        });
    useEffect(() => { load().catch(() => setError("Impossible de charger votre configuration.")); }, []);
    usePageRefresh(load);

    const toggle = (level) =>
        setSelected((cur) => (cur.includes(level) ? cur.filter((l) => l !== level) : [...cur, level]));

    const dirty = data
        ? [...selected].sort().join("|") !== [...(data.selected || [])].sort().join("|")
        : false;

    async function save() {
        setSaving(true);
        try {
            const d = await api.updateTeacherConfig(selected);
            setData(d);
            setSelected(d.selected || []);
            toast("Vos classes ont été mises à jour.");
        } catch (err) {
            toast(err?.data?.message || "Enregistrement impossible. Réessayez.");
        } finally {
            setSaving(false);
        }
    }

    const title = (
        <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-extrabold">
            <SlidersHorizontal className="h-5 w-5 text-brass" /> Paramètre de configuration
        </h2>
    );

    if (error) {
        return <div>{title}<p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p></div>;
    }

    if (data === null) {
        return <div>{title}<p className="text-sm text-slate-600">Chargement…</p></div>;
    }

    // --- Vue « Établissement » : centre en lecture seule + gestion des niveaux.
    if (view === "etablissement") {
        return (
            <div>
                {title}
                <button type="button" onClick={() => { setSelected(data.selected || []); setView("home"); }} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brass">
                    <ArrowLeft className="h-4 w-4" /> Retour
                </button>

                {!data.centre ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-line bg-amber-50 p-4 text-sm text-amber-700">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Aucun établissement n'est rattaché à votre compte. Contactez l'administration pour pouvoir gérer vos classes.</p>
                    </div>
                ) : (
                    <div className="max-w-2xl space-y-5 rounded-2xl border border-line bg-surface p-5">
                        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-slate-50 p-3">
                            <School className="h-5 w-5 shrink-0 text-brass" />
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Établissement</p>
                                <p className="font-bold">{data.centre}</p>
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-sm font-semibold text-slate-700">Mes classes (niveaux)</p>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {data.levels.map((level) => {
                                    const on = selected.includes(level);
                                    return (
                                        <label
                                            key={level}
                                            className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm font-semibold transition-colors ${
                                                on ? "border-brass bg-indigo-50 text-brass-deep" : "border-line hover:bg-slate-50"
                                            }`}
                                        >
                                            <input type="checkbox" checked={on} onChange={() => toggle(level)} className="h-4 w-4" />
                                            {level}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button type="button" onClick={save} disabled={saving || !dirty} className="btn-primary disabled:opacity-50">
                                <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- Vue d'accueil : cartes cliquables.
    const cardClass = "group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-left transition hover:border-brass hover:shadow-sm";
    const iconWrap = "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-brass";

    return (
        <div>
            {title}
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Gérez les classes que vous assurez dans votre établissement et accédez à vos cours.
            </p>

            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                <button type="button" onClick={() => setView("etablissement")} className={cardClass}>
                    <span className={iconWrap}><School className="h-6 w-6" /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-display text-base font-extrabold">Établissement</span>
                        <span className="block text-sm text-slate-600">
                            {data.centre || "Aucun établissement"}
                            {data.centre && ` · ${(data.selected || []).length} niveau${(data.selected || []).length > 1 ? "x" : ""} actif${(data.selected || []).length > 1 ? "s" : ""}`}
                        </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-brass" />
                </button>

                <Link to="/mes-cours" className={cardClass}>
                    <span className={iconWrap}><BookOpenCheck className="h-6 w-6" /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-display text-base font-extrabold">Mes cours</span>
                        <span className="block text-sm text-slate-600">Gérer mes bibliographies de cours</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-brass" />
                </Link>
            </div>
        </div>
    );
}
