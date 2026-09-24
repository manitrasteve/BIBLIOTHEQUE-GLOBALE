import { useEffect, useState } from "react";
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
} from "lucide-react";
import { api } from "../lib/api";

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
    creation_compte: { label: "Compte créé", icon: UserPlus },
    validation_compte: { label: "Compte validé", icon: UserCheck },
    renvoi_lien_creation_mot_de_passe: { label: "Lien de création du mot de passe renvoyé", icon: UserCheck },
    desactivation_compte: { label: "Compte désactivé", icon: UserX },
    reactivation_compte: { label: "Compte réactivé", icon: UserCheck },
    suppression_utilisateur: { label: "Compte supprimé", icon: UserX },
    permissions_modifiees: { label: "Permissions modifiées", icon: UserCheck },
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

export default function MyActivitiesPage() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        let active = true;
        setResult(null);
        setError(null);
        api.getActivityLogs({ page, mine: 1 })
            .then((res) => active && setResult(res))
            .catch(() => {
                if (!active) return;
                setError("Impossible de charger vos activités.");
                setResult({ data: [] });
            });
        return () => {
            active = false;
        };
    }, [page]);

    const rows = result?.data || [];

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <Activity className="h-5 w-5 text-brass" />
                <h2 className="font-display text-xl font-extrabold">Mes activités</h2>
            </div>

            {error && (
                <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            )}

            {result === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : rows.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucune activité enregistrée pour l'instant.
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
