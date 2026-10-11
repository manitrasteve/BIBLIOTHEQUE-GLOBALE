import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Ticket,
    FileText,
    LibraryBig,
    BarChart3,
    Bot,
    GraduationCap,
    BookOpen,
    AlertTriangle,
    UserCheck,
    MessageSquare,
    ArrowRight,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { usePageRefresh } from "../../context/RefreshContext";
import WelcomeBanner from "../../components/WelcomeBanner";
import StatTrend, { StatTrendSkeleton } from "../../components/StatTrend";

export default function LibrarianDashboardPage() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getAdminDashboard()
            .then(setData)
            .catch(() => setError("Impossible de charger votre tableau de bord pour le moment."));
    }, []);
    usePageRefresh(() => api.getAdminDashboard().then((d) => { setData(d); setError(null); }));

    const firstName = user?.name?.split(" ")[0] || "";
    const pending = (data?.pending_account_validations ?? 0) + (data?.pending_account_requests ?? 0);

    return (
        <div className="w-full">
            <WelcomeBanner
                eyebrow="Service Numérique"
                title={<>Bonjour, {firstName} <span aria-hidden="true">👋</span></>}
                description={
                    pending > 0
                        ? <>Vous avez <strong className="text-white">{pending} demande{pending > 1 ? "s" : ""}</strong> de compte à traiter.</>
                        : "Gérez les demandes de comptes, les documents et consultez le catalogue."
                }
                primary={
                    pending > 0
                        ? { label: "Traiter les demandes", to: "/bibliothecaire/tickets-comptes" }
                        : { label: "Gérer les documents", to: "/bibliothecaire/documents" }
                }
                secondary={{ label: "Catalogue", to: "/bibliothecaire/catalogue" }}
            />

            {error && (
                <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">
                    {error}
                </p>
            )}

            {!data && !error && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, i) => <StatTrendSkeleton key={i} />)}
                </div>
            )}

            {data && (
                <>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatTrend
                            icon={BookOpen}
                            tone="indigo"
                            value={data.total_documents ?? 0}
                            label="Documents publiés"
                            deltaText={`${data.total_consultations ?? 0} consultation${(data.total_consultations ?? 0) > 1 ? "s" : ""}`}
                            deltaDirection="flat"
                            to="/bibliothecaire/documents"
                        />
                        <StatTrend
                            icon={UserCheck}
                            tone="brass"
                            value={data.pending_account_validations ?? 0}
                            label="Comptes vérifiés à valider"
                            deltaText={data.pending_account_validations > 0 ? "À traiter" : "Rien à valider"}
                            deltaDirection={data.pending_account_validations > 0 ? "up" : "flat"}
                            to="/bibliothecaire/tickets-comptes?status=verifiee"
                        />
                        <StatTrend
                            icon={AlertTriangle}
                            tone="rose"
                            value={data.pending_account_requests ?? 0}
                            label="Nouvelles demandes"
                            deltaText={data.pending_account_requests > 0 ? "À examiner" : "Boîte vide"}
                            deltaDirection={data.pending_account_requests > 0 ? "up" : "flat"}
                            to="/bibliothecaire/tickets-comptes?status=en_attente"
                        />
                        <StatTrend
                            icon={Ticket}
                            tone="emerald"
                            value={data.total_users ?? 0}
                            label="Utilisateurs"
                            deltaText="Dans la bibliothèque"
                            deltaDirection="flat"
                        />
                    </div>

                    {/* Raccourcis vers les sections principales. */}
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <ShortcutCard icon={Ticket} title="Demandes de compte" description="Vérifier et traiter les demandes de création de compte." to="/bibliothecaire/tickets-comptes" />
                        <ShortcutCard icon={FileText} title="Documents" description="Gérer les livres, mémoires et documents numériques." to="/bibliothecaire/documents" />
                        <ShortcutCard icon={LibraryBig} title="Catalogue" description="Consulter les documents publiés dans la bibliothèque." to="/bibliothecaire/catalogue" />
                        <ShortcutCard icon={GraduationCap} title="Enseignants" description="Gérer les classes des enseignants." to="/bibliothecaire/enseignants" />
                        {user?.permissions?.includes("voir_statistiques") && (
                            <ShortcutCard icon={BarChart3} title="Statistiques" description="Suivi des indicateurs de la bibliothèque." to="/bibliothecaire/statistiques" />
                        )}
                        <ShortcutCard icon={Bot} title="Assistant" description="Outil IA réservé au Service Numérique." to="/bibliothecaire/assistant" />
                        <ShortcutCard icon={MessageSquare} title="Messages" description="Communiquez avec l'équipe de la bibliothèque." to="/bibliothecaire/messages" />
                    </div>
                </>
            )}
        </div>
    );
}

function ShortcutCard({ icon: Icon, title, description, to }) {
    return (
        <Link to={to} className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-surface p-5 transition hover:-translate-y-0.5 hover:border-indigo-300">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-brass-deep">
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className="font-display text-base font-extrabold text-ink">{title}</h3>
            <p className="text-sm text-ink-soft">{description}</p>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-brass group-hover:text-brass-deep">
                Ouvrir <ArrowRight className="h-3.5 w-3.5" />
            </span>
        </Link>
    );
}
