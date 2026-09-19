import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radar, Plus, Trash2, Tag, Hash } from "lucide-react";
import { api } from "../lib/api";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("fr-FR");
}

export default function ScientificWatchPage() {
    const [topics, setTopics] = useState(null);
    const [categories, setCategories] = useState([]);
    const [error, setError] = useState(null);
    const [type, setType] = useState("mot_cle");
    const [term, setTerm] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState(null);
    const [documents, setDocuments] = useState(null);
    const [docPage, setDocPage] = useState(1);

    function loadTopics() {
        return api
            .getWatchTopics()
            .then((res) => setTopics(res.data || []))
            .catch(() => {
                setError("Impossible de charger vos thèmes suivis.");
                setTopics([]);
            });
    }

    useEffect(() => {
        loadTopics();
        api.getCategories().then(setCategories).catch(() => {});
    }, []);

    useEffect(() => {
        if (!selected) return undefined;
        let active = true;
        setDocuments(null);
        api.getWatchTopicDocuments(selected.id, { page: docPage })
            .then((res) => {
                if (!active) return;
                setDocuments(res);
                // Les « Nouveau » restent affichés ; les nouveautés sont marquées vues côté serveur
                // et les compteurs des thèmes actualisés.
                if (docPage === 1 && res.data.some((d) => d.is_new)) {
                    api.markWatchTopicSeen(selected.id).then(loadTopics).catch(() => {});
                }
            })
            .catch(() => active && setDocuments({ data: [] }));
        return () => {
            active = false;
        };
    }, [selected?.id, docPage]);

    async function add(event) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await api.addWatchTopic(
                type === "domaine" ? { type, category_id: categoryId } : { type, term: term.trim() },
            );
            setTerm("");
            setCategoryId("");
            await loadTopics();
        } catch (err) {
            setError(err?.data?.errors ? Object.values(err.data.errors).flat()[0] : err?.message);
        } finally {
            setBusy(false);
        }
    }

    async function remove(topic) {
        if (!confirm(`Ne plus suivre « ${topic.label} » ?`)) return;
        try {
            await api.deleteWatchTopic(topic.id);
            if (selected?.id === topic.id) {
                setSelected(null);
                setDocuments(null);
            }
            await loadTopics();
        } catch {
            setError("Impossible de supprimer ce thème.");
        }
    }

    function open(topic) {
        setSelected(topic);
        setDocPage(1);
    }

    const canSubmit = type === "domaine" ? categoryId !== "" : term.trim() !== "";

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <Radar className="h-5 w-5 text-indigo-600" />
                <h2 className="font-display text-xl font-extrabold">Veille scientifique</h2>
            </div>

            <form onSubmit={add} className="modern-card mb-6 space-y-3 p-4 sm:p-5">
                <p className="text-sm text-slate-600">
                    Suivez un mot-clé ou un domaine : les documents publiés après le début du suivi sont signalés comme nouveaux.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        aria-label="Type de thème"
                        className={`${inputClass} sm:w-44`}
                    >
                        <option value="mot_cle">Mot-clé</option>
                        <option value="domaine">Domaine</option>
                    </select>
                    {type === "domaine" ? (
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            aria-label="Domaine à suivre"
                            className={`${inputClass} flex-1`}
                        >
                            <option value="">Choisir un domaine…</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={term}
                            onChange={(e) => setTerm(e.target.value)}
                            maxLength={120}
                            placeholder="Ex. : changement climatique"
                            aria-label="Mot-clé à suivre"
                            className={`${inputClass} flex-1`}
                        />
                    )}
                    <button type="submit" disabled={!canSubmit || busy} className="btn-primary justify-center">
                        <Plus className="h-4 w-4" />
                        Suivre
                    </button>
                </div>
            </form>

            {error && (
                <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            )}

            {topics === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : topics.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Vous ne suivez encore aucun thème.
                </div>
            ) : (
                <ul className="mb-6 grid gap-3 sm:grid-cols-2">
                    {topics.map((topic) => (
                        <li
                            key={topic.id}
                            className={`modern-card flex items-center justify-between gap-3 p-4 ${
                                selected?.id === topic.id ? "border-indigo-400" : ""
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => open(topic)}
                                className="min-w-0 flex-1 text-left"
                            >
                                <span className="flex items-center gap-2 font-bold text-slate-900">
                                    {topic.type === "domaine" ? (
                                        <Tag className="h-4 w-4 shrink-0 text-indigo-600" />
                                    ) : (
                                        <Hash className="h-4 w-4 shrink-0 text-indigo-600" />
                                    )}
                                    <span className="break-words">{topic.label}</span>
                                </span>
                                <span className="mt-1 block text-xs text-slate-500">
                                    {topic.total} document{topic.total > 1 ? "s" : ""}
                                    {topic.new_count > 0 && (
                                        <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 font-semibold text-white">
                                            {topic.new_count} nouveau{topic.new_count > 1 ? "x" : ""}
                                        </span>
                                    )}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => remove(topic)}
                                className="btn-secondary !px-3"
                                aria-label={`Ne plus suivre ${topic.label}`}
                                title="Ne plus suivre"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {selected && (
                <section aria-live="polite">
                    <h3 className="mb-3 font-display text-lg font-extrabold">
                        Documents : {selected.label}
                    </h3>
                    {documents === null ? (
                        <p className="text-slate-500">Chargement…</p>
                    ) : documents.data.length === 0 ? (
                        <div className="modern-card p-8 text-center text-slate-500">
                            Aucun document ne correspond à ce thème pour l'instant.
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {documents.data.map((doc) => (
                                <li key={doc.slug}>
                                    <Link
                                        to={`/documents/${doc.slug}`}
                                        className="modern-card block p-4 hover:border-indigo-300"
                                    >
                                        <p className="break-words font-bold text-slate-900">
                                            {doc.title}
                                            {doc.is_new && (
                                                <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                                                    Nouveau
                                                </span>
                                            )}
                                        </p>
                                        {doc.authors?.length > 0 && (
                                            <p className="text-sm text-slate-600">{doc.authors.join(", ")}</p>
                                        )}
                                        <p className="mt-1 text-xs text-slate-500">
                                            {[doc.category, doc.type, doc.year].filter(Boolean).join(" · ")}
                                            {doc.published_at ? ` · publié le ${formatDate(doc.published_at)}` : ""}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}

                    {documents?.last_page > 1 && (
                        <div className="mt-6 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={docPage <= 1}
                                onClick={() => setDocPage((p) => p - 1)}
                            >
                                Précédent
                            </button>
                            <span className="text-sm text-slate-500">
                                Page {documents.current_page} / {documents.last_page}
                            </span>
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={docPage >= documents.last_page}
                                onClick={() => setDocPage((p) => p + 1)}
                            >
                                Suivant
                            </button>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
