import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { api } from "../lib/api";
import { useRefresh } from "../context/RefreshContext";
import { READING, TeacherAvatar, dueInfo } from "../pages/RecommendedReadingsPage";

// Tableau de bord de l'étudiant : les prochaines lectures recommandées, avec l'enseignant qui les a envoyées.
// La liste complète, regroupée par enseignant, est sur la page « Lectures recommandées ».
export default function RecommendedReadings() {
    const [lists, setLists] = useState(null);
    const refreshCount = useRefresh()?.refreshCount;

    useEffect(() => {
        api.getMyCourseLists().then(setLists).catch(() => setLists([]));
    }, [refreshCount]);

    if (!lists?.length) return null;

    const items = lists
        .flatMap((list) => list.items.map((item) => ({ ...item, list })))
        .filter((i) => i.reading !== "lu")
        .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    const teacherCount = new Set(lists.map((l) => l.teacher?.id)).size;

    return (
        <section className="mt-7 rounded-2xl border border-line bg-surface p-5" aria-labelledby="recommended-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="recommended-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
                    <BookOpenCheck className="h-5 w-5 text-brass" /> Lectures recommandées
                </h2>
                <Link to="/lectures-recommandees" className="flex items-center gap-1 text-sm font-bold text-brass hover:text-brass-deep">
                    Tout voir ({teacherCount} enseignant{teacherCount > 1 ? "s" : ""}) <ArrowRight className="h-4 w-4" />
                </Link>
            </div>

            {items.length === 0 ? (
                <p className="mt-3 text-sm text-emerald-700">Bravo, vous avez lu toutes les lectures recommandées.</p>
            ) : (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                    {items.slice(0, 4).map((item) => {
                        const due = dueInfo(item.due_date, item.reading);
                        return (
                            <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                                <TeacherAvatar teacher={item.list.teacher} size="h-8 w-8 text-xs" />
                                <div className="min-w-0 flex-1">
                                    <Link to={`/documents/${item.document.slug}`} className="text-sm font-semibold hover:text-brass-deep">{item.document.title}</Link>
                                    <p className="text-xs text-slate-500">Envoyé par <b className="text-slate-700">{item.list.teacher?.name}</b> · {item.list.title}</p>
                                    {item.instruction && <p className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{item.instruction}</p>}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${READING[item.reading]?.cls}`}>{READING[item.reading]?.label}</span>
                                    {due && <span className={`text-xs font-semibold ${due.cls}`}>{due.text}</span>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {items.length > 4 && <p className="mt-2 text-xs text-slate-500">… et {items.length - 4} autre{items.length - 4 > 1 ? "s" : ""} lecture{items.length - 4 > 1 ? "s" : ""}.</p>}
        </section>
    );
}
