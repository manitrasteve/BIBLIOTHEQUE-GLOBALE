import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Layers } from "lucide-react";
import { api } from "../lib/api";

// « Documents similaires » : mêmes auteurs, même catégorie ou mots-clés communs (calculé par le serveur).
export default function SimilarDocuments({ slug }) {
    const [items, setItems] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setItems(null);
        api.getSimilarDocuments(slug)
            .then((list) => !cancelled && setItems(Array.isArray(list) ? list : []))
            .catch(() => !cancelled && setItems([]));
        return () => {
            cancelled = true;
        };
    }, [slug]);

    if (!items?.length) return null;

    return (
        <section className="border-t border-line mt-4 pt-4" aria-labelledby="similar-title">
            <div className="flex items-center gap-2 mb-3">
                <Layers className="h-3.5 w-3.5 text-brass" strokeWidth={1.75} aria-hidden="true" />
                <h2 id="similar-title" className="text-[10px] font-semibold uppercase tracking-wider text-ink">
                    Documents similaires
                </h2>
            </div>
            <ul className="space-y-2">
                {items.map((d) => (
                    <li key={d.slug}>
                        <Link
                            to={`/documents/${d.slug}`}
                            className="flex gap-3 rounded-lg p-1.5 -mx-1.5 hover:bg-paper-dim transition-colors"
                        >
                            <div className="w-9 flex-shrink-0 overflow-hidden rounded border border-line bg-paper-dim">
                                {d.cover_url ? (
                                    <img src={d.cover_url} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
                                ) : (
                                    <div className="flex aspect-[3/4] w-full items-center justify-center text-slate-400">
                                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-medium leading-snug text-ink line-clamp-2">{d.title}</p>
                                <p className="mt-0.5 truncate text-[10px] text-ink-soft">
                                    {[d.authors?.join(", "), d.year].filter(Boolean).join(" · ")}
                                </p>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
