import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageRefresh } from "../../context/RefreshContext";
import {
    History,
    LogIn,
    Eye,
    Sparkles,
    UserPlus,
    UserCheck,
    UserX,
    Upload,
    Heart,
    HeartOff,
    Search,
    ListFilter,
    FilePlus2,
    Pencil,
    Archive,
    ArchiveRestore,
    Trash2,
    Building2,
    LayoutTemplate,
} from "lucide-react";
import { api } from "../../lib/api";
import { SkeletonList } from "../../components/Skeleton";

// Pagination commune aux quatre vues (le serveur pagine : 30 entrées globales, 25 par vue détaillée).
function Pagination({ meta, page, onChange }) {
    if (!meta || meta.last_page <= 1) return null;

    return (
        <nav
            aria-label="Pagination"
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
        >
            <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => onChange(page - 1)}
            >
                Précédent
            </button>
            <span className="text-sm text-ink-soft">
                Page {meta.current_page} / {meta.last_page} · {meta.total} entrées
            </span>
            <button
                type="button"
                className="btn-secondary"
                disabled={page >= meta.last_page}
                onClick={() => onChange(page + 1)}
            >
                Suivant
            </button>
        </nav>
    );
}

// Noms lisibles des champs affichés dans « avant → après » (modifications d'un document / d'une bibliothèque).
const FIELD_LABELS = {
    title: "Titre",
    subtitle: "Sous-titre",
    abstract: "Résumé",
    type: "Type",
    niveau: "Niveau",
    category: "Catégorie",
    library: "Bibliothèque",
    year: "Année",
    publisher: "Éditeur",
    isbn: "ISBN",
    language: "Langue",
    edition: "Édition",
    keywords: "Mots-clés",
    access_level: "Niveau d'accès",
    authors: "Auteur(s)",
    status: "Statut",
    publication_prevue: "Publication prévue",
    fichier: "Fichier PDF",
    couverture: "Couverture",
    name: "Nom",
    description: "Description",
    address: "Adresse",
    location: "Localisation",
    opening_hours: "Horaires",
    opening_days: "Jours d'ouverture",
    map_link: "Lien carte",
    photo: "Photo",
    utilisateurs: "Comptes",
    documents: "Documents",
};
const VALUE_LABELS = { brouillon: "Brouillon", programme: "Programmé", publie: "Publié", archive: "Archivé" };

function formatChange(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (Array.isArray(value)) return value.join(", ");
    const text = String(value);
    // Date ISO (ex. publication prévue) : affichée en heure locale.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return new Date(text).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
    return VALUE_LABELS[text] || (text.length > 80 ? `${text.slice(0, 80)}…` : text);
}

const ACTION_CONFIG = {
    // Gestion des documents, bibliothèques et comptes (audit)
    creation_document: { label: "Document ajouté", icon: FilePlus2 },
    modification_document: { label: "Document modifié", icon: Pencil },
    archivage_document: { label: "Document archivé", icon: Archive },
    suppression_document: { label: "Document supprimé", icon: Trash2 },
    restauration_document: { label: "Document restauré", icon: ArchiveRestore },
    suppression_definitive_document: { label: "Document supprimé définitivement", icon: Trash2 },
    creation_bibliotheque: { label: "Bibliothèque créée", icon: Building2 },
    modification_bibliotheque: { label: "Bibliothèque modifiée", icon: Pencil },
    suppression_bibliotheque: { label: "Bibliothèque supprimée", icon: Trash2 },
    restauration_utilisateur: { label: "Compte restauré", icon: ArchiveRestore },
    suppression_definitive_utilisateur: { label: "Compte supprimé définitivement", icon: UserX },
    vidage_corbeille: { label: "Corbeille vidée", icon: Trash2 },
    publication_page_accueil: { label: "Page d'accueil publiée", icon: LayoutTemplate },
    restauration_page_accueil: { label: "Page d'accueil restaurée", icon: LayoutTemplate },

    connexion: {
        label: "Connexion",
        icon: LogIn,
    },

    consultation_document: {
        label: "Consultation de document",
        icon: Eye,
    },

    question_ia: {
        label: "Question à l'IA",
        icon: Sparkles,
    },

    creation_compte: {
        label: "Création de compte",
        icon: UserPlus,
    },

    validation_compte: {
        label: "Validation de compte",
        icon: UserCheck,
    },

    desactivation_compte: {
        label: "Désactivation de compte",
        icon: UserX,
    },

    reactivation_compte: {
        label: "Réactivation de compte",
        icon: UserCheck,
    },

    suppression_utilisateur: {
        label: "Compte supprimé",
        icon: UserX,
    },

    publication_document: {
        label: "Publication de document",
        icon: Upload,
    },
    programmation_document: {
        label: "Publication programmée",
        icon: Upload,
    },
    annulation_programmation_document: {
        label: "Programmation annulée",
        icon: Upload,
    },
    permissions_modifiees: {
        label: "Permissions modifiées",
        icon: UserCheck,
    },

    // Actions enregistrées par le système mais absentes de la liste jusqu'ici.
    creation_bibliothecaire: {
        label: "Création de bibliothécaire",
        icon: UserPlus,
    },
    ajout_favori: {
        label: "Favori ajouté",
        icon: Heart,
    },
    retrait_favori: {
        label: "Favori supprimé",
        icon: HeartOff,
    },
    recherche: {
        label: "Recherche",
        icon: Search,
    },
    renvoi_lien_creation_mot_de_passe: {
        label: "Lien de création du mot de passe renvoyé",
        icon: UserCheck,
    },
};

export default function AdminActivityPage() {
    const [searchParams] = useSearchParams();

    const type = searchParams.get("type") || "";

    const [logs, setLogs] = useState(null);
    const [meta, setMeta] = useState(null);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState("");
    const [error, setError] = useState(null);

    // Changer de vue ou de filtre repart de la première page.
    useEffect(() => {
        setPage(1);
    }, [type, actionFilter]);

    /*
     * Chargement selon le type demandé par les cartes
     * du dashboard administrateur.
     */
    function fetchLogs() {
        if (type === "consultations") return api.getAdminConsultations({ page });
        if (type === "ai") return api.getAdminAiQueries({ page });
        if (type === "favoris") return api.getAdminFavorites({ page });
        return api.getActivityLogs({
            page,
            ...(actionFilter ? { action: actionFilter } : {}),
        });
    }

    useEffect(() => {
        let active = true; // ignore les réponses arrivées en retard (changement rapide de filtre / page)
        setLogs(null);
        setError(null);

        fetchLogs()
            .then((res) => {
                if (!active) return;
                setLogs(res.data || []);
                setMeta(res);
            })
            .catch(() => {
                if (!active) return;
                setError("Impossible de charger l'historique.");
                setLogs([]);
                setMeta(null);
            });

        return () => {
            active = false;
        };
    }, [type, actionFilter, page]);

    usePageRefresh(() => fetchLogs().then((res) => {
        setLogs(res.data || []);
        setMeta(res);
        setError(null);
    }));

    /*
     * Affichage spécifique : consultations
     */
    if (type === "consultations") {
        return (
            <div>
                <div className="mb-6">
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                        <Eye
                            className="h-5 w-5 text-brass"
                            strokeWidth={1.75}
                        />
                        Historique des consultations
                    </h2>

                    <p className="mt-1 text-sm text-ink-soft">
                        Consultez les documents consultés par les utilisateurs.
                    </p>
                </div>

                {error && (
                    <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </p>
                )}

                {logs === null ? (
                    <SkeletonList />
                ) : logs.length === 0 ? (
                    <div className="modern-card p-5 text-center text-ink-soft">
                        Aucune consultation enregistrée.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((row) => (
                            <div
                                key={row.id}
                                className="modern-card flex items-center gap-4 p-4"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-brass">
                                    <Eye className="h-5 w-5" />
                                </span>

                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-ink">
                                        {row.user?.name ||
                                            "Utilisateur supprimé"}
                                    </p>

                                    <p className="truncate text-sm text-ink-soft">
                                        {row.document?.title ||
                                            "Document supprimé"}
                                    </p>

                                    <p className="mt-1 text-xs text-ink-soft">
                                        {row.document?.type || ""}
                                        {row.document?.year
                                            ? ` · ${row.document.year}`
                                            : ""}
                                    </p>
                                </div>

                                <p className="shrink-0 text-xs text-ink-soft">
                                    {row.consulted_at
                                        ? new Date(
                                              row.consulted_at,
                                          ).toLocaleString("fr-FR")
                                        : "—"}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                <Pagination meta={meta} page={page} onChange={setPage} />
            </div>
        );
    }

    /*
     * Affichage spécifique : questions IA
     */
    if (type === "ai") {
        return (
            <div>
                <div className="mb-6">
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                        <Sparkles
                            className="h-5 w-5 text-brass"
                            strokeWidth={1.75}
                        />
                        Historique des questions IA
                    </h2>

                    <p className="mt-1 text-sm text-ink-soft">
                        Consultez les questions posées à l'assistant IA par les
                        utilisateurs.
                    </p>
                </div>

                {error && (
                    <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </p>
                )}

                {logs === null ? (
                    <SkeletonList />
                ) : logs.length === 0 ? (
                    <div className="modern-card p-5 text-center text-ink-soft">
                        Aucune question IA enregistrée.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((row) => (
                            <div key={row.id} className="modern-card p-5">
                                <div className="flex items-start gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-brass">
                                        <Sparkles className="h-5 w-5" />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-semibold text-ink">
                                                {row.user?.name ||
                                                    "Utilisateur supprimé"}
                                            </p>

                                            <p className="text-xs text-ink-soft">
                                                {row.created_at
                                                    ? new Date(
                                                          row.created_at,
                                                      ).toLocaleString("fr-FR")
                                                    : "—"}
                                            </p>
                                        </div>

                                        {row.document?.title && (
                                            <p className="mt-1 text-xs font-medium text-brass">
                                                Document : {row.document.title}
                                            </p>
                                        )}

                                        <p className="mt-3 text-sm leading-6 text-ink">
                                            {row.question ||
                                                row.query ||
                                                "Question non disponible"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <Pagination meta={meta} page={page} onChange={setPage} />
            </div>
        );
    }

    /*
     * Affichage spécifique : favoris
     */
    if (type === "favoris") {
        return (
            <div>
                <div className="mb-6">
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                        <Heart
                            className="h-5 w-5 text-brass"
                            strokeWidth={1.75}
                        />
                        Historique des favoris
                    </h2>

                    <p className="mt-1 text-sm text-ink-soft">
                        Consultez les documents ajoutés aux favoris par les
                        utilisateurs.
                    </p>
                </div>

                {error && (
                    <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </p>
                )}

                {logs === null ? (
                    <SkeletonList />
                ) : logs.length === 0 ? (
                    <div className="modern-card p-5 text-center text-ink-soft">
                        Aucun favori enregistré.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((row) => (
                            <div
                                key={row.id}
                                className="modern-card flex items-center gap-4 p-4"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                                    <Heart className="h-5 w-5" />
                                </span>

                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-ink">
                                        {row.user?.name ||
                                            "Utilisateur supprimé"}
                                    </p>

                                    <p className="truncate text-sm text-ink-soft">
                                        {row.document?.title ||
                                            "Document supprimé"}
                                    </p>

                                    <p className="mt-1 text-xs text-ink-soft">
                                        {row.document?.type || ""}
                                        {row.document?.year
                                            ? ` · ${row.document.year}`
                                            : ""}
                                    </p>
                                </div>

                                <p className="shrink-0 text-xs text-ink-soft">
                                    {row.created_at
                                        ? new Date(
                                              row.created_at,
                                          ).toLocaleString("fr-FR")
                                        : "—"}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                <Pagination meta={meta} page={page} onChange={setPage} />
            </div>
        );
    }

    /*
     * Historique global existant
     */
    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                        <History
                            className="h-5 w-5 text-brass"
                            strokeWidth={1.75}
                        />
                        Historique global
                    </h2>

                    <p className="mt-1 text-sm text-ink-soft">
                        Toutes les activités importantes effectuées sur la
                        plateforme.
                    </p>
                </div>

                <div className="relative">
                    <ListFilter
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        strokeWidth={1.75}
                    />

                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="rounded-lg border border-line bg-surface py-2 pl-8 pr-3 text-sm"
                    >
                        <option value="">Toutes les actions</option>

                        {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
                            <option key={key} value={key}>
                                {cfg.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {error && (
                <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </p>
            )}

            {logs === null ? (
                <SkeletonList />
            ) : logs.length === 0 ? (
                <p className="text-sm text-ink-soft">
                    Aucune activité enregistrée pour ce filtre.
                </p>
            ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                    {logs.map((log) => {
                        const cfg = ACTION_CONFIG[log.action] || {
                            label: log.action,
                            icon: History,
                        };

                        const Icon = cfg.icon;

                        return (
                            <li
                                key={log.id}
                                className="flex items-center gap-3 p-4"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-dim text-ink-soft">
                                    <Icon
                                        className="h-4 w-4"
                                        strokeWidth={1.75}
                                    />
                                </span>

                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm text-ink">
                                        <span className="font-medium">
                                            {log.user?.name ||
                                                "Utilisateur supprimé"}
                                        </span>{" "}
                                        — {cfg.label}
                                    </p>

                                    {log.description && (
                                        <p className="mt-0.5 break-words text-xs text-ink-soft">
                                            {log.description}
                                            {log.library?.name && log.library.name !== log.description ? ` · ${log.library.name}` : ""}
                                        </p>
                                    )}

                                    {log.changes && Object.keys(log.changes).length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                                            {Object.entries(log.changes).map(([field, change]) => (
                                                <li key={field} className="break-words">
                                                    <span className="font-medium text-ink">
                                                        {FIELD_LABELS[field] || field}
                                                    </span>{" "}
                                                    : {formatChange(change?.before)} → {formatChange(change?.after)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <p className="shrink-0 text-xs text-slate-500">
                                    {new Date(log.created_at).toLocaleString(
                                        "fr-FR",
                                    )}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Pagination meta={meta} page={page} onChange={setPage} />
        </div>
    );
}
