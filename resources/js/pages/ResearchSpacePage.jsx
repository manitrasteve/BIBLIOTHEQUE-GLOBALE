import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Microscope, Search, SearchX, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { useDebouncedValue } from "../lib/search";
import DocumentCard from "../components/DocumentCard";
import { SkeletonDocumentCard } from "../components/Skeleton";

const TYPES = [
    { value: "livre", label: "Livre" },
    { value: "memoire", label: "Mémoire" },
    { value: "these", label: "Thèse" },
    { value: "rapport", label: "Rapport" },
    { value: "autre", label: "Autre" },
];

const LANGUAGES = [
    { value: "fr", label: "Français" },
    { value: "mg", label: "Malgache" },
    { value: "en", label: "Anglais" },
    { value: "es", label: "Espagnol" },
    { value: "pt", label: "Portugais" },
    { value: "it", label: "Italien" },
    { value: "ru", label: "Russe" },
    { value: "autre", label: "Autre" },
];

const FILTER_KEYS = ["author", "category_id", "type", "year", "library_id", "language"];
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";

// Espace recherche du chercheur : même moteur que le catalogue (GET /documents),
// avec des filtres avancés. Les résultats se mettent à jour pendant la saisie ;
// seule une recherche validée (bouton / Entrée) est ajoutée à « Mes recherches ».
export default function ResearchSpacePage() {
    const [searchParams] = useSearchParams();
    const initial = (key) => searchParams.get(key) || "";

    const [q, setQ] = useState(initial("q"));
    const [filters, setFilters] = useState(
        Object.fromEntries(FILTER_KEYS.map((key) => [key, initial(key)])),
    );
    const [page, setPage] = useState(1);
    const [categories, setCategories] = useState([]);
    const [libraries, setLibraries] = useState([]);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.getCategories().then(setCategories).catch(() => {});
        api.getLibraries()
            .then((res) => setLibraries(Array.isArray(res) ? res : res?.data || []))
            .catch(() => {});
    }, []);

    // Recherche pendant la saisie ; champ vidé => état initial (tout le catalogue).
    const debouncedQ = useDebouncedValue(q.trim(), 350);
    const debouncedAuthor = useDebouncedValue(filters.author.trim(), 350);
    const debouncedYear = useDebouncedValue(filters.year.trim(), 350);

    useEffect(() => {
        let active = true;
        setResults(null);
        setError(null);

        const params = { page };
        if (debouncedQ) params.q = debouncedQ;
        if (debouncedAuthor) params.author = debouncedAuthor;
        if (debouncedYear) params.year = debouncedYear;
        ["category_id", "type", "library_id", "language"].forEach((key) => {
            if (filters[key]) params[key] = filters[key];
        });

        api.searchDocuments(params)
            .then((res) => active && setResults(res))
            .catch(() => {
                if (!active) return;
                setError("Impossible de charger les résultats pour le moment.");
                setResults({ data: [] });
            });
        return () => {
            active = false;
        };
    }, [
        debouncedQ,
        debouncedAuthor,
        debouncedYear,
        filters.category_id,
        filters.type,
        filters.library_id,
        filters.language,
        page,
    ]);

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
        setSaved(false);
    }

    function reset() {
        setQ("");
        setFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, ""])));
        setPage(1);
        setSaved(false);
    }

    async function submit(event) {
        event.preventDefault();
        const query = q.trim();
        if (!query) return;

        try {
            await api.saveSearch({ query, filters });
            setSaved(true);
        } catch {
            setSaved(false);
        }
    }

    const hasCriteria = q.trim() !== "" || FILTER_KEYS.some((key) => filters[key] !== "");

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <Microscope className="h-5 w-5 text-indigo-600" />
                <h2 className="font-display text-xl font-extrabold">Espace recherche</h2>
            </div>

            <form onSubmit={submit} className="modern-card mb-6 space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        type="search"
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value);
                            setPage(1);
                            setSaved(false);
                        }}
                        placeholder="Mots-clés, titre, auteur…"
                        aria-label="Mots-clés"
                        className={`${inputClass} min-w-0 sm:max-w-[600px] sm:flex-1`}
                    />
                    <button type="submit" className="btn-primary justify-center sm:shrink-0" disabled={!q.trim()}>
                        <Search className="h-4 w-4" />
                        Rechercher
                    </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <input
                        type="text"
                        value={filters.author}
                        onChange={(e) => setFilter("author", e.target.value)}
                        placeholder="Auteur"
                        aria-label="Auteur"
                        className={inputClass}
                    />
                    <select
                        value={filters.category_id}
                        onChange={(e) => setFilter("category_id", e.target.value)}
                        aria-label="Domaine"
                        className={inputClass}
                    >
                        <option value="">Tous les domaines</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filters.type}
                        onChange={(e) => setFilter("type", e.target.value)}
                        aria-label="Type de document"
                        className={inputClass}
                    >
                        <option value="">Tous les types</option>
                        {TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="number"
                        inputMode="numeric"
                        min="1000"
                        max="2100"
                        value={filters.year}
                        onChange={(e) => setFilter("year", e.target.value)}
                        placeholder="Année"
                        aria-label="Année"
                        className={inputClass}
                    />
                    <select
                        value={filters.library_id}
                        onChange={(e) => setFilter("library_id", e.target.value)}
                        aria-label="Bibliothèque"
                        className={inputClass}
                    >
                        <option value="">Toutes les bibliothèques</option>
                        {libraries.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filters.language}
                        onChange={(e) => setFilter("language", e.target.value)}
                        aria-label="Langue"
                        className={inputClass}
                    >
                        <option value="">Toutes les langues</option>
                        {LANGUAGES.map((l) => (
                            <option key={l.value} value={l.value}>
                                {l.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500" role="status">
                        {saved
                            ? "Recherche enregistrée dans « Mes recherches »."
                            : "Validez la recherche pour la retrouver dans « Mes recherches »."}
                    </p>
                    {hasCriteria && (
                        <button type="button" onClick={reset} className="btn-secondary">
                            <RotateCcw className="h-4 w-4" />
                            Réinitialiser
                        </button>
                    )}
                </div>
            </form>

            {results === null && <SkeletonDocumentCard />}
            {error && <p className="mb-4 text-red-700">{error}</p>}

            {results && !error && (
                results.data.length === 0 ? (
                    <div className="modern-card p-10 text-center text-slate-500">
                        <SearchX className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} />
                        Aucun document ne correspond à ces critères.
                    </div>
                ) : (
                    <>
                        <p className="mb-3 text-sm text-slate-500">
                            {results.total} résultat{results.total > 1 ? "s" : ""}
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            {results.data.map((doc) => (
                                <DocumentCard key={doc.slug} document={doc} />
                            ))}
                        </div>
                        {results.last_page > 1 && (
                            <div className="mt-6 flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => p - 1)}
                                >
                                    Précédent
                                </button>
                                <span className="text-sm text-slate-500">
                                    Page {results.current_page} / {results.last_page}
                                </span>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={page >= results.last_page}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    Suivant
                                </button>
                            </div>
                        )}
                    </>
                )
            )}
        </div>
    );
}
