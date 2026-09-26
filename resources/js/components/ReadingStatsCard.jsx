import { useEffect, useState } from "react";
import { BookOpen, Eye, FileText, Heart, Sparkles, StickyNote } from "lucide-react";
import { api } from "../lib/api";
import { Skeleton } from "./Skeleton";

const TILES = [
    { key: "documents_read", label: "Documents lus", Icon: BookOpen },
    { key: "consultations", label: "Consultations", Icon: Eye },
    { key: "pages_reached", label: "Pages atteintes", Icon: FileText },
    { key: "notes", label: "Notes prises", Icon: StickyNote },
    { key: "favorites", label: "Favoris", Icon: Heart },
    { key: "ai_queries", label: "Questions à l'IA", Icon: Sparkles },
];

const number = new Intl.NumberFormat("fr-FR");

// Profil lecteur : chiffres de lecture (tuiles) et catégories les plus lues (barres de proportion,
// une seule teinte ; la valeur est toujours écrite en texte, jamais portée par la seule couleur).
export default function ReadingStatsCard() {
    const [stats, setStats] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        api.getReadingStats().then(setStats).catch(() => setFailed(true));
    }, []);

    if (failed) return null;

    const top = stats?.top_categories || [];
    const max = Math.max(1, ...top.map((c) => c.documents));

    return (
        <section className="modern-card mb-6 p-4 sm:p-5" aria-labelledby="reading-stats-title">
            <h3 id="reading-stats-title" className="text-lg font-extrabold text-slate-900">
                Mon activité de lecture
            </h3>
            <p className="mt-1 text-sm text-slate-500">Depuis la création de votre compte.</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {TILES.map(({ key, label, Icon }) => (
                    <div key={key} className="rounded-2xl border border-slate-100 bg-surface p-3">
                        <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                            <Icon className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                            {label}
                        </dt>
                        <dd className="mt-1 font-display text-2xl font-extrabold tabular-nums text-slate-900">
                            {stats ? number.format(stats[key] ?? 0) : <Skeleton className="inline-block h-7 w-10" label="Chargement" />}
                        </dd>
                    </div>
                ))}
            </dl>

            {top.length > 0 && (
                <div className="mt-5">
                    <h4 className="text-sm font-bold text-slate-800">Catégories préférées</h4>
                    <ol className="mt-2 space-y-2">
                        {top.map((c) => (
                            <li key={c.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                                <span className="truncate text-slate-700" title={c.name}>{c.name}</span>
                                <span className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                                    <span
                                        className="block h-full rounded-full bg-indigo-600"
                                        style={{ width: `${(c.documents / max) * 100}%` }}
                                    />
                                </span>
                                <span className="text-xs tabular-nums text-slate-600">
                                    {c.documents} document{c.documents > 1 ? "s" : ""}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}
