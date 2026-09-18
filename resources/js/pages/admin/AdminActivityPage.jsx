import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    History,
    LogIn,
    Eye,
    Sparkles,
    BookOpenCheck,
    UserPlus,
    UserCheck,
    UserX,
    Upload,
    Heart,
    ListFilter,
} from "lucide-react";
import { api } from "../../lib/api";
import { SkeletonList } from "../../components/Skeleton";

const ACTION_CONFIG = {
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
    permissions_modifiees: {
        label: "Permissions modifiées",
        icon: UserCheck,
    },
};

export default function AdminActivityPage() {
    const [searchParams] = useSearchParams();

    const type = searchParams.get("type") || "";

    const [logs, setLogs] = useState(null);
    const [actionFilter, setActionFilter] = useState("");
    const [error, setError] = useState(null);

    /*
     * Chargement selon le type demandé par les cartes
     * du dashboard administrateur.
     */
    useEffect(() => {
        setLogs(null);
        setError(null);

        let promise;

        if (type === "consultations") {
            promise = api.getAdminConsultations();
        } else if (type === "ai") {
            promise = api.getAdminAiQueries();
        } else if (type === "favoris") {
            promise = api.getAdminFavorites();
        } else {
            promise = api.getActivityLogs(
                actionFilter ? { action: actionFilter } : {},
            );
        }

        promise
            .then((res) => {
                setLogs(res.data || []);
            })
            .catch(() => {
                setError("Impossible de charger l'historique.");
                setLogs([]);
            });
    }, [type, actionFilter]);

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
                    <div className="modern-card p-8 text-center text-ink-soft">
                        Aucune consultation enregistrée.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((row) => (
                            <div
                                key={row.id}
                                className="modern-card flex items-center gap-4 p-4"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
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
                    <div className="modern-card p-8 text-center text-ink-soft">
                        Aucune question IA enregistrée.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((row) => (
                            <div key={row.id} className="modern-card p-5">
                                <div className="flex items-start gap-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
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
                                            <p className="mt-1 text-xs font-medium text-indigo-600">
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
                    <div className="modern-card p-8 text-center text-ink-soft">
                        Aucun favori enregistré.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((row) => (
                            <div
                                key={row.id}
                                className="modern-card flex items-center gap-4 p-4"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
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
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/60"
                        strokeWidth={1.75}
                    />

                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="rounded-lg border border-line bg-white/60 py-2 pl-8 pr-3 text-sm"
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
                                    <p className="text-sm text-ink">
                                        <span className="font-medium">
                                            {log.user?.name ||
                                                "Utilisateur supprimé"}
                                        </span>{" "}
                                        — {cfg.label}
                                    </p>

                                    {log.description && (
                                        <p className="mt-0.5 text-xs text-ink-soft">
                                            {log.description}
                                        </p>
                                    )}
                                </div>

                                <p className="shrink-0 text-xs text-ink-soft/70">
                                    {new Date(log.created_at).toLocaleString(
                                        "fr-FR",
                                    )}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
