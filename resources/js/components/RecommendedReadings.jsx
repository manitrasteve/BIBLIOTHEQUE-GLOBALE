import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenCheck } from "lucide-react";
import { api } from "../lib/api";
import { useRefresh } from "../context/RefreshContext";

const READING = {
    lu: { label: "Lu", cls: "bg-green-100 text-green-700" },
    commence: { label: "Commencé", cls: "bg-amber-100 text-amber-700" },
};

function dueLabel(due) {
    const days = Math.round((new Date(`${due}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
    if (days < 0) return { text: `Échéance dépassée (${new Date(`${due}T00:00:00`).toLocaleDateString("fr-FR")})`, cls: "text-red-700" };
    if (days === 0) return { text: "À lire aujourd’hui", cls: "text-red-700" };
    if (days <= 7) return { text: `À lire dans ${days} jour${days > 1 ? "s" : ""}`, cls: "text-amber-700" };
    return { text: `À lire avant le ${new Date(`${due}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`, cls: "text-slate-600" };
}

// Étudiant : lectures recommandées par les enseignants de sa classe (établissement + niveau du profil).
export default function RecommendedReadings() {
    const [lists, setLists] = useState(null);
    const refreshCount = useRefresh()?.refreshCount;

    useEffect(() => {
        api.getMyCourseLists().then(setLists).catch(() => setLists([]));
    }, [refreshCount]);

    if (!lists?.length) return null;
    const toRead = lists.flatMap((l) => l.items).filter((i) => i.reading !== "lu" && i.due_date && dueLabel(i.due_date).cls !== "text-slate-600").length;

    return (
        <section className="mt-7 rounded-2xl border border-line bg-surface p-5" aria-labelledby="recommended-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="recommended-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
                    <BookOpenCheck className="h-5 w-5 text-brass" /> Lectures recommandées
                </h2>
                {toRead > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{toRead} à lire bientôt</span>}
            </div>
            <div className="mt-4 space-y-5">
                {lists.map((list) => (
                    <div key={list.id}>
                        <p className="text-sm font-bold">{list.title}</p>
                        <p className="text-xs text-slate-500">{list.teacher} · {list.school} · {list.level}{list.filiere ? ` · ${list.filiere}` : ""}</p>
                        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                            {list.items.map((item) => {
                                const due = item.due_date && item.reading !== "lu" ? dueLabel(item.due_date) : null;
                                return (
                                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <Link to={`/documents/${item.document.slug}`} className="text-sm font-semibold hover:text-brass-deep">{item.document.title}</Link>
                                            {item.instruction && <p className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{item.instruction}</p>}
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {READING[item.reading] && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${READING[item.reading].cls}`}>{READING[item.reading].label}</span>}
                                            {due && <span className={`text-xs font-semibold ${due.cls}`}>{due.text}</span>}
                                        </div>
                                    </li>
                                );
                            })}
                            {list.items.length === 0 && <li className="px-3 py-2.5 text-xs text-slate-500">Aucune lecture pour le moment.</li>}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}
