import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenCheck, CalendarClock, GraduationCap } from "lucide-react";
import { api } from "../lib/api";
import { usePageRefresh } from "../context/RefreshContext";

export const READING = {
    a_lire: { label: "À lire", cls: "bg-slate-100 text-slate-700" },
    commence: { label: "Commencé", cls: "bg-amber-100 text-amber-700" },
    lu: { label: "Lu", cls: "bg-green-100 text-green-700" },
};

const STATUS_FILTERS = [
    { key: "", label: "Toutes" },
    { key: "a_lire", label: "À lire" },
    { key: "commence", label: "Commencées" },
    { key: "lu", label: "Lues" },
];

const day = (iso) => new Date(`${iso}T00:00:00`);
const formatDay = (date, opts = { day: "numeric", month: "long" }) => date.toLocaleDateString("fr-FR", opts);

// Échéance lisible et sa couleur (rouge si dépassée ou aujourd'hui, ambre dans la semaine).
export function dueInfo(due, reading) {
    if (!due || reading === "lu") return null;
    const days = Math.round((day(due) - new Date(new Date().toDateString())) / 86400000);
    if (days < 0) return { text: `Échéance dépassée (${formatDay(day(due))})`, cls: "text-red-700" };
    if (days === 0) return { text: "À lire aujourd’hui", cls: "text-red-700" };
    if (days <= 7) return { text: `À lire dans ${days} jour${days > 1 ? "s" : ""}`, cls: "text-amber-700" };
    return { text: `À lire avant le ${formatDay(day(due))}`, cls: "text-slate-600" };
}

function initials(name = "") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function TeacherAvatar({ teacher, size = "h-10 w-10 text-sm" }) {
    const [failed, setFailed] = useState(false);
    if (teacher?.photo_url && !failed) {
        return <img src={teacher.photo_url} alt="" onError={() => setFailed(true)} className={`${size} shrink-0 rounded-full object-cover`} />;
    }
    return <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-indigo-600 font-bold text-white`} aria-hidden="true">{initials(teacher?.name)}</span>;
}

// Étudiant : toutes les lectures envoyées par ses enseignants, regroupées par enseignant.
export default function RecommendedReadingsPage() {
    const [lists, setLists] = useState(null);
    const [error, setError] = useState(null);
    const [teacherId, setTeacherId] = useState("");
    const [status, setStatus] = useState("");

    const load = () => api.getMyCourseLists().then((d) => { setLists(d); setError(null); });
    useEffect(() => { load().catch(() => setError("Impossible de charger vos lectures recommandées.")); }, []);
    usePageRefresh(load);

    // Regroupement par enseignant : chaque bibliographie appartient à un seul enseignant.
    const teachers = useMemo(() => {
        const map = new Map();
        (lists || []).forEach((list) => {
            const t = list.teacher || { id: 0, name: "Enseignant" };
            if (!map.has(t.id)) map.set(t.id, { ...t, lists: [] });
            map.get(t.id).lists.push(list);
        });
        return [...map.values()].map((t) => {
            const items = t.lists.flatMap((l) => l.items);
            return { ...t, total: items.length, toRead: items.filter((i) => i.reading === "a_lire").length };
        });
    }, [lists]);

    const visibleTeachers = teachers
        .filter((t) => !teacherId || String(t.id) === teacherId)
        .map((t) => ({
            ...t,
            lists: t.lists
                .map((l) => ({
                    ...l,
                    items: l.items
                        .filter((i) => !status || i.reading === status)
                        .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")),
                }))
                .filter((l) => l.items.length),
        }))
        .filter((t) => t.lists.length);

    return (
        <div>
            <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-extrabold">
                <BookOpenCheck className="h-5 w-5 text-brass" /> Mes lectures recommandées
            </h2>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Les lectures envoyées par les enseignants de votre classe. Chaque lecture indique l’enseignant qui l’a envoyée,
                le cours concerné, sa consigne et sa date limite.
            </p>

            {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            {lists === null ? (
                !error && <p className="text-sm text-slate-500">Chargement…</p>
            ) : teachers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                    Aucune lecture recommandée pour le moment. Elles apparaîtront ici dès qu’un enseignant de votre classe en enverra.
                    <span className="mt-2 block text-xs">Vérifiez que votre établissement et votre niveau sont bien renseignés dans votre profil.</span>
                </div>
            ) : (
                <>
                    {/* Filtre par enseignant : on sait toujours qui a envoyé quoi. */}
                    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer par enseignant">
                        <button type="button" onClick={() => setTeacherId("")} aria-pressed={!teacherId}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${!teacherId ? "border-brass bg-indigo-50 text-brass-deep" : "border-slate-200 text-slate-600 hover:border-brass"}`}>
                            Tous les enseignants ({teachers.length})
                        </button>
                        {teachers.map((t) => (
                            <button key={t.id} type="button" onClick={() => setTeacherId(String(t.id))} aria-pressed={teacherId === String(t.id)}
                                className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-semibold ${teacherId === String(t.id) ? "border-brass bg-indigo-50 text-brass-deep" : "border-slate-200 text-slate-600 hover:border-brass"}`}>
                                <TeacherAvatar teacher={t} size="h-6 w-6 text-[10px]" />
                                {t.name}
                                {t.toRead > 0 && <span className="rounded-full bg-amber-600 px-1.5 text-[11px] font-extrabold text-white">{t.toRead}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrer par état de lecture">
                        {STATUS_FILTERS.map((f) => (
                            <button key={f.key} type="button" onClick={() => setStatus(f.key)} aria-pressed={status === f.key}
                                className={`rounded-lg px-3 py-1 text-xs font-bold ${status === f.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {visibleTeachers.length === 0 && <p className="text-sm text-slate-500">Aucune lecture dans cette sélection.</p>}

                    <div className="space-y-6">
                        {visibleTeachers.map((t) => (
                            <section key={t.id} className="rounded-2xl border border-line bg-surface" aria-label={`Lectures envoyées par ${t.name}`}>
                                <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
                                    <TeacherAvatar teacher={t} size="h-12 w-12 text-base" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold uppercase tracking-wide text-brass">Envoyé par</p>
                                        <p className="font-display text-lg font-extrabold leading-tight">{t.name}</p>
                                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                            <GraduationCap className="h-3.5 w-3.5" />
                                            {[t.position, t.teaching_specialty, t.faculty].filter(Boolean).join(" · ") || "Enseignant"}
                                        </p>
                                    </div>
                                    <span className="text-xs font-semibold text-slate-600">
                                        {t.total} lecture{t.total > 1 ? "s" : ""}{t.toRead ? ` · ${t.toRead} à lire` : ""}
                                    </span>
                                </header>

                                <div className="space-y-4 p-4">
                                    {t.lists.map((list) => (
                                        <div key={list.id}>
                                            <p className="text-sm font-bold">{list.title}</p>
                                            <p className="text-xs text-slate-500">
                                                {list.school} · {list.level}{list.filiere ? ` · ${list.filiere}` : ""}
                                                {list.description ? ` · ${list.description}` : ""}
                                            </p>
                                            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                                                {list.items.map((item) => {
                                                    const due = dueInfo(item.due_date, item.reading);
                                                    return (
                                                        <li key={item.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                                                            <div className="min-w-0">
                                                                <Link to={`/documents/${item.document.slug}`} className="font-semibold hover:text-brass-deep">{item.document.title}</Link>
                                                                <p className="text-xs text-slate-500">
                                                                    {item.document.type ? `${item.document.type} · ` : ""}Envoyé par {t.name}
                                                                    {item.added_at ? ` le ${formatDay(new Date(item.added_at), { day: "numeric", month: "long", year: "numeric" })}` : ""}
                                                                </p>
                                                                {item.instruction && <p className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Consigne : {item.instruction}</p>}
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${READING[item.reading]?.cls}`}>{READING[item.reading]?.label}</span>
                                                                {due && <span className={`flex items-center gap-1 text-xs font-semibold ${due.cls}`}><CalendarClock className="h-3.5 w-3.5" />{due.text}</span>}
                                                                <Link to={`/documents/${item.document.slug}`} className="text-xs font-bold text-brass hover:text-brass-deep">
                                                                    {item.reading === "a_lire" ? "Commencer la lecture →" : item.reading === "commence" ? "Continuer →" : "Relire →"}
                                                                </Link>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
