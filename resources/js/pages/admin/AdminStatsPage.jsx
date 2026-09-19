import { useEffect, useState } from "react";
import {
    Users,
    UserCheck,
    BookOpen,
    Eye,
    Sparkles,
    Heart,
    AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { SkeletonDashboard } from "../../components/Skeleton";
import StatCard from "../../components/StatCard";
import { useAuth } from "../../context/AuthContext";

export default function AdminStatsPage() {
    const [s, setS] = useState(null);
    const { user } = useAuth();
    // Le bibliothécaire ayant « Voir les statistiques » consulte cette page en lecture seule :
    // les liens vers les pages réservées à l'administrateur sont masqués.
    const isAdmin = user?.role === "administrateur";
    const canSeePopularity = isAdmin || user?.permissions?.includes("voir_popularite");

    useEffect(() => {
        api.getAdminDashboard()
            .then(setS)
            .catch(() => {});
    }, []);

    if (!s) {
        return <SkeletonDashboard />;
    }

    return (
        <div>
            <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                    <h2 className="font-display text-xl font-extrabold">
                        Vue d'ensemble
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                        Suivez les principales activités de la bibliothèque.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Utilisateurs */}
                <StatCard
                    icon={Users}
                    label="Utilisateurs"
                    value={s.total_users}
                    to={isAdmin ? "/administrateur/utilisateurs" : undefined}
                />

                {/* Comptes vérifiés à valider */}
                <StatCard
                    icon={UserCheck}
                    label="Demandes vérifiées à valider"
                    value={s.pending_account_validations}
                    tone="warning"
                    to={isAdmin ? "/administrateur/comptes?status=verifiee" : "/bibliothecaire/tickets-comptes?status=verifiee"}
                />

                {/* Documents publiés */}
                <StatCard
                    icon={BookOpen}
                    label="Documents publiés"
                    value={s.total_documents}
                    to="/recherche"
                />

                {/* Nouvelles demandes */}
                <StatCard
                    icon={AlertTriangle}
                    label="Nouvelles demandes"
                    value={s.pending_account_requests}
                    tone="warning"
                    to={isAdmin ? "/administrateur/comptes?status=en_attente" : "/bibliothecaire/tickets-comptes?status=en_attente"}
                />

                {/* Consultations */}
                <StatCard
                    icon={Eye}
                    label="Consultations"
                    value={s.total_consultations}
                    to={isAdmin ? "/administrateur/historique?type=consultations" : undefined}
                />

                {/* Questions IA */}
                <StatCard
                    icon={Sparkles}
                    label="Questions posées à l'IA"
                    value={s.total_ai_queries}
                    to={isAdmin ? "/administrateur/historique?type=ai" : undefined}
                />

                {/* Favoris */}
                <StatCard
                    icon={Heart}
                    label="Favoris"
                    value={s.total_favorites}
                    to={isAdmin ? "/administrateur/historique?type=favoris" : undefined}
                />
            </div>

            {canSeePopularity && <div className="mt-6">
                <Link
                    to={isAdmin ? "/administrateur/popularite" : "/bibliothecaire/popularite"}
                    className="modern-card flex items-center justify-between gap-4 p-5 transition hover:border-indigo-300 hover:shadow-md"
                >
                    <div>
                        <p className="font-bold text-slate-900">
                            Voir la popularité des documents
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                            Consultez les documents les plus consultés, favoris
                            et utilisés avec l'IA.
                        </p>
                    </div>

                    <span className="text-sm font-bold text-indigo-600">
                        Voir →
                    </span>
                </Link>
            </div>}
        </div>
    );
}
