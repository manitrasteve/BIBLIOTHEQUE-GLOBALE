import { useEffect, useRef, useState } from "react";
import {
    Activity,
    LogIn,
    Eye,
    Sparkles,
    Heart,
    HeartOff,
    Search,
    Upload,
    UserPlus,
    UserCheck,
    UserX,
    LayoutTemplate,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { api } from "../lib/api";
import { usePageRefresh } from "../context/RefreshContext";
import { matchesSearch } from "../lib/search";
import LocalTimeFilters, { EMPTY_TIME_FILTERS } from "../components/LocalTimeFilters";

// Seules les actions réellement enregistrées par le système sont affichées.
const ACTION_CONFIG = {
    connexion: { label: "Connexion", icon: LogIn },
    consultation_document: { label: "Document consulté", icon: Eye },
    question_ia: { label: "Question à l'Assistant IA", icon: Sparkles },
    ajout_favori: { label: "Favori ajouté", icon: Heart },
    retrait_favori: { label: "Favori supprimé", icon: HeartOff },
    recherche: { label: "Recherche", icon: Search },
    // Actions du personnel (administrateur / bibliothécaire) déjà enregistrées par le système.
    publication_document: { label: "Document publié", icon: Upload },
    programmation_document: { label: "Publication programmée", icon: Upload },
    annulation_programmation_document: { label: "Programmation annulée", icon: Upload },
    creation_compte: { label: "Compte créé", icon: UserPlus },
    validation_compte: { label: "Compte validé", icon: UserCheck },
    renvoi_lien_creation_mot_de_passe: { label: "Lien de création du mot de passe renvoyé", icon: UserCheck },
    desactivation_compte: { label: "Compte désactivé", icon: UserX },
    reactivation_compte: { label: "Compte réactivé", icon: UserCheck },
    suppression_utilisateur: { label: "Compte supprimé", icon: UserX },
    permissions_modifiees: { label: "Permissions modifiées", icon: UserCheck },
    depot_document: { label: "Support de cours déposé", icon: Upload },
    demande_classe_enseignant: { label: "Classe demandée", icon: UserPlus },
    refus_demande_classe: { label: "Demande de classe refusée", icon: UserX },
    questions_revision: { label: "Questions de révision générées", icon: Sparkles },
    refus_depot_document: { label: "Dépôt d’enseignant refusé", icon: UserX },
    classes_enseignant_modifiees: { label: "Classes d’un enseignant modifiées", icon: UserCheck },
    creation_bibliothecaire: { label: "Bibliothécaire créé", icon: UserPlus },
    // Actions de gestion (audit)
    creation_document: { label: "Document ajouté", icon: Upload },
    modification_document: { label: "Document modifié", icon: Upload },
    archivage_document: { label: "Document archivé", icon: Upload },
    suppression_document: { label: "Document supprimé", icon: UserX },
    restauration_document: { label: "Document restauré", icon: Upload },
    suppression_definitive_document: { label: "Document supprimé définitivement", icon: UserX },
    creation_bibliotheque: { label: "Bibliothèque créée", icon: UserPlus },
    modification_bibliotheque: { label: "Bibliothèque modifiée", icon: UserCheck },
    suppression_bibliotheque: { label: "Bibliothèque supprimée", icon: UserX },
    restauration_utilisateur: { label: "Compte restauré", icon: UserCheck },
    suppression_definitive_utilisateur: { label: "Compte supprimé définitivement", icon: UserX },
    vidage_corbeille: { label: "Corbeille vidée", icon: UserX },
    publication_page_accueil: { label: "Page d'accueil publiée", icon: LayoutTemplate },
    restauration_page_accueil: { label: "Page d'accueil restaurée", icon: LayoutTemplate },
};

function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("fr-FR");
}

// Codes d'action dont le libellé affiché correspond à la recherche (« document consulté » → consultation_document) :
// le serveur ne connaît que les codes, il les reçoit en plus du texte recherché.
function actionsMatching(search) {
    if (!search) return [];
    return Object.entries(ACTION_CONFIG)
        .filter(([, config]) => matchesSearch(config.label, search))
        .map(([action]) => action);
}

export default function MyActivitiesPage() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    // Recherche (envoyée après une courte pause de frappe) et filtres, appliqués par le serveur sur toutes les pages.
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filters, setFilters] = useState(EMPTY_TIME_FILTERS);
    const [showFilters, setShowFilters] = useState(false);

    const activeFilterCount = Object.values(filters).filter(Boolean).length;
    const term = debouncedSearch.trim();
    const isFiltering = Boolean(term) || activeFilterCount > 0;

    // Nouvelle recherche : retour à la première page (dans la même mise à jour : une seule requête).
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Seule la réponse de la dernière requête est affichée (frappe rapide, changements de filtres successifs).
    const requestRef = useRef(0);
    async function fetchActivities() {
        const requestId = ++requestRef.current;
        const res = await api.getActivityLogs({ page, mine: 1, search: term, actions: actionsMatching(term), ...filters });
        if (requestId !== requestRef.current) return;
        setResult(res);
        setError(null);
    }

    useEffect(() => {
        fetchActivities().catch(() => {
            setError("Impossible de charger vos activités.");
            setResult({ data: [] });
        });
    }, [page, debouncedSearch, filters]);
    usePageRefresh(fetchActivities);

    function setFilter(key, value) {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    }

    function resetFilters() {
        setSearch("");
        setDebouncedSearch("");
        setFilters(EMPTY_TIME_FILTERS);
        setPage(1);
    }

    const rows = result?.data || [];

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <Activity className="h-5 w-5 text-brass" />
                <h2 className="font-display text-xl font-extrabold">Mes activités</h2>
            </div>

            {/* Recherche + filtres */}
            <div className="mb-5 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher une activité, un document…"
                            aria-label="Rechercher dans mes activités"
                            className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowFilters((v) => !v)}
                        aria-expanded={showFilters}
                        className={`btn-secondary shrink-0 justify-center ${activeFilterCount ? "border-brass text-brass-deep" : ""}`}
                    >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                        Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}
                    </button>
                </div>

                {showFilters && (
                    <div className="modern-card grid gap-3 p-4 sm:grid-cols-3">
                        <LocalTimeFilters value={filters} onChange={setFilter} />
                    </div>
                )}

                {isFiltering && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                        <span>{result?.total != null ? `${result.total} activité${result.total > 1 ? "s" : ""} trouvée${result.total > 1 ? "s" : ""}` : "Recherche…"}</span>
                        <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-semibold text-brass hover:text-brass-deep">
                            <X className="h-4 w-4" aria-hidden="true" /> Réinitialiser
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            )}

            {result === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : rows.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    {isFiltering ? "Aucune activité ne correspond à votre recherche ou à vos filtres." : "Aucune activité enregistrée pour l'instant."}
                </div>
            ) : (
                <ul className="space-y-3">
                    {rows.map((log) => {
                        const config = ACTION_CONFIG[log.action];
                        const Icon = config?.icon || Activity;

                        return (
                            <li key={log.id} className="modern-card flex items-start gap-3 p-4">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-brass">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-900">
                                        {config?.label || log.action.replaceAll("_", " ")}
                                    </p>
                                    {log.description && (
                                        <p className="break-words text-sm text-slate-600">
                                            {log.description}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">
                                        {formatDate(log.created_at)}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {result?.last_page > 1 && (
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
                        Page {result.current_page} / {result.last_page}
                    </span>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={page >= result.last_page}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Suivant
                    </button>
                </div>
            )}
        </div>
    );
}
