import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Eye,
    Sparkles,
    Bell,
    Heart,
    BookOpen,
    ArrowRight,
    Inbox,
    LayoutDashboard,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";

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

    return (
        <div className="w-full px-0 py-0">
            <section className="hero-glow p-6 sm:p-9">
                <div className="relative z-10">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <span className="badge-modern bg-white/10 text-indigo-100 ring-1 ring-white/15">
                                <LayoutDashboard className="h-3.5 w-3.5" />
                                {ROLE_LABELS[user?.role] || "Compte"}
                            </span>
                            <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
                                Bonjour, {user?.name?.split(" ")[0]}
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm sm:text-base leading-6 text-indigo-100">
                                Retrouvez ici vos consultations, vos questions à
                                l’IA, vos favoris et vos activités récentes.
                            </p>
                        </div>
                        <Link
                            to="/recherche"
                            className="btn-primary !bg-white/95 !text-indigo-700 !shadow-none"
                        >
                            Parcourir le catalogue{" "}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {error && (
                <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">
                    {error}
                </p>
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
                            to="/favoris"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
