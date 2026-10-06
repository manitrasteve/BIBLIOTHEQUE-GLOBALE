import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Eye,
    Sparkles,
    Bell,
    Heart,
    ArrowRight,
    LayoutDashboard,
} from "lucide-react";
import { api } from "../lib/api";
import { usePageRefresh } from "../context/RefreshContext";
import { useAuth } from "../context/AuthContext";
import StatCard, { StatCardSkeleton } from "../components/StatCard";

const ROLE_LABELS = {
    etudiant: "Étudiant",
    enseignant: "Enseignant",
    chercheur: "Chercheur",
    autres: "Autres",
    bibliothecaire: "Service Numérique",
    administrateur: "Administrateur",
};

export default function DashboardPage() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getMyDashboard()
            .then(setData)
            .catch(() =>
                setError(
                    "Impossible de charger votre tableau de bord pour le moment.",
                ),
            );
    }, []);
    usePageRefresh(() => api.getMyDashboard().then((d) => { setData(d); setError(null); }));

    return (
        <div className="w-full px-0 py-0">
            <section className="hero-banner p-4 sm:p-9">
                <div className="relative z-10">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <span className="badge-modern bg-indigo-700 text-on-primary-soft">
                                <LayoutDashboard className="h-3.5 w-3.5" />
                                {ROLE_LABELS[user?.role] || "Compte"}
                            </span>
                            <h1 className="mt-4 font-display text-2xl sm:text-2xl font-extrabold tracking-tight">
                                Bonjour, {user?.name?.split(" ")[0]}
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm sm:text-base leading-6 text-on-primary-soft">
                                Retrouvez ici vos consultations, vos questions à
                                l’IA, vos favoris et vos activités récentes.
                            </p>
                        </div>
                        <Link
                            to="/recherche"
                            className="btn-primary !bg-[#ffffff] !text-indigo-700"
                        >
                            Parcourir le catalogue{" "}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {error && (
                <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">
                    {error}
                </p>
            )}

            {!data && !error && (
                <div
                    role="status"
                    aria-label="Chargement du tableau de bord"
                    className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                    {Array.from({ length: 4 }, (_, index) => (
                        <StatCardSkeleton key={index} />
                    ))}
                </div>
            )}

            {data && (
                <>
                    <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            icon={Eye}
                            label="Documents consultés aujourd'hui"
                            value={data.today_consultations}
                            hint="Vos consultations du jour"
                            to="/recherche"
                        />

                        <StatCard
                            icon={Sparkles}
                            label="Questions posées à l'IA"
                            value={data.today_ai_queries}
                            hint="Vos interactions avec l'assistant IA"
                            to="/recherche"
                        />

                        <StatCard
                            icon={Bell}
                            label="Notifications non lues"
                            value={data.unread_notifications}
                            hint="Consultez vos notifications"
                            tone="success"
                            to="/notifications"
                        />

                        <StatCard
                            icon={Heart}
                            label="Mes favoris"
                            value={data.favorites}
                            hint="Vos documents favoris"
                            to="/mes-favoris"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
