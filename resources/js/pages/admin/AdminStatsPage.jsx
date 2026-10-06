import { useEffect, useState } from "react";
import { usePageRefresh } from "../../context/RefreshContext";
import {
    Users,
    UserCheck,
    BookOpen,
    Eye,
    Sparkles,
    Heart,
    AlertTriangle,
    FileDown,
    Clock3,
    UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { SkeletonDashboard } from "../../components/Skeleton";
import StatCard from "../../components/StatCard";
import { useAuth } from "../../context/AuthContext";
import MonthlyChart from "../../components/charts/MonthlyChart";
import { HBarList, RoleShare, trend } from "../../components/charts/Breakdowns";

const PERIODS = [3, 6, 12];
const fmt = (value) => new Intl.NumberFormat("fr-FR").format(value ?? 0);

/** Délai en heures → « 5 h » ou « 1,6 j ». */
export function formatDelay(hours) {
    if (hours === null || hours === undefined) return "—";
    return hours < 24 ? `${fmt(Math.round(hours * 10) / 10)} h` : `${fmt(Math.round((hours / 24) * 10) / 10)} j`;
}

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminStatsPage() {
    const [s, setS] = useState(null);
    const [error, setError] = useState(null);
    const { user } = useAuth();
    // Le bibliothécaire ayant « Voir les statistiques » consulte cette page en lecture seule :
    // les liens vers les pages réservées à l'administrateur sont masqués.
    const isAdmin = user?.role === "administrateur";
    const canSeePopularity = isAdmin || user?.permissions?.includes("voir_popularite");

    // Graphiques : période, établissement et mois du rapport.
    const [months, setMonths] = useState(12);
    const [establishment, setEstablishment] = useState("");
    const [reportMonth, setReportMonth] = useState(currentMonth());
    const [stats, setStats] = useState(null);
    const [statsError, setStatsError] = useState(null);

    useEffect(() => {
        api.getAdminDashboard()
            .then(setS)
            .catch(() => setError("Impossible de charger les statistiques pour le moment."));
    }, []);

    useEffect(() => {
        setStatsError(null);
        api.getStatistics({ months, ...(establishment ? { establishment } : {}) })
            .then(setStats)
            .catch(() => setStatsError("Impossible de charger les graphiques pour le moment."));
    }, [months, establishment]);

    // Actualisation : chiffres clés et graphiques de la période choisie, sans repasser par le squelette.
    usePageRefresh(async () => {
        const [dashboard, statistics] = await Promise.all([
            api.getAdminDashboard(),
            api.getStatistics({ months, ...(establishment ? { establishment } : {}) }),
        ]);
        setS(dashboard);
        setStats(statistics);
        setStatsError(null);
    });

    if (error) {
        return (
            <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">
                {error}
            </p>
        );
    }

    if (!s) {
        return <SkeletonDashboard />;
    }

    const k = stats?.kpis;
    const keys = stats?.series.keys ?? [];
    const previousLabel = stats ? new Date(`${keys[keys.length - 2] ?? keys[0]}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "short" }) : "";
    const reportUrl = `/rapport-mensuel?mois=${reportMonth}${establishment ? `&etablissement=${establishment}` : ""}`;

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
                    className="modern-card flex items-center justify-between gap-4 p-5 transition hover:border-indigo-300 hover:"
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

                    <span className="text-sm font-bold text-brass">
                        Voir →
                    </span>
                </Link>
            </div>}

            {/* ================= Évolution : graphiques ================= */}
            <section className="mt-10" aria-labelledby="evolution-titre">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 id="evolution-titre" className="font-display text-xl font-extrabold">Évolution</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {stats ? `Indicateurs de ${stats.month_label}, comparés au mois précédent.` : "Chargement des graphiques…"}
                        </p>
                    </div>

                    {/* Filtres sur une seule ligne, au-dessus des graphiques */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div role="group" aria-label="Période des graphiques" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
                            {PERIODS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={months === value}
                                    onClick={() => setMonths(value)}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${months === value ? "bg-indigo-600 text-white" : "text-ink-soft hover:text-ink"}`}
                                >
                                    {value} mois
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-ink-soft">
                            <span>Établissement</span>
                            <select
                                value={establishment}
                                onChange={(e) => setEstablishment(e.target.value)}
                                className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink"
                            >
                                <option value="">Tous</option>
                                {(stats?.establishment_options ?? []).map((option) => (
                                    <option key={option.code} value={option.code}>{option.code}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-ink-soft">
                            <span className="sr-only">Mois du rapport</span>
                            <input
                                type="month"
                                value={reportMonth}
                                max={currentMonth()}
                                onChange={(e) => e.target.value && setReportMonth(e.target.value)}
                                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
                            />
                        </label>
                        <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                            <FileDown className="h-4 w-4" />
                            Rapport mensuel (PDF)
                        </a>
                    </div>
                </div>

                {statsError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{statsError}</p>}

                {stats && (
                    <>
                        {/* Indicateurs du mois */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <StatCard icon={UserPlus} label="Membres actifs" value={fmt(k.active_members)} hint={`+${fmt(k.new_members)} ce mois`} />
                            <StatCard icon={AlertTriangle} label="Demandes de compte (mois)" value={fmt(k.requests.current)} hint={trend(k.requests.current, k.requests.previous, previousLabel)} />
                            <StatCard icon={Clock3} label="Délai moyen de validation" value={formatDelay(k.validation_hours.current)} hint={k.validation_hours.previous !== null ? `${formatDelay(k.validation_hours.previous)} le mois précédent` : "Aucune validation le mois précédent"} />
                            <StatCard icon={Eye} label="Consultations (mois)" value={fmt(k.consultations.current)} hint={trend(k.consultations.current, k.consultations.previous, previousLabel)} />
                            <StatCard icon={Sparkles} label="Questions à l'IA (mois)" value={fmt(k.ai_queries.current)} hint={trend(k.ai_queries.current, k.ai_queries.previous, previousLabel)} />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-4">
                            <section className="modern-card min-w-0 flex-[999_1_560px] p-5">
                                <h3 className="font-bold text-ink">Demandes de compte par mois</h3>
                                <p className="mb-3 mt-1 text-sm text-ink-soft">{months} derniers mois</p>
                                <MonthlyChart type="line" labels={stats.series.labels} values={stats.series.requests} unit="demandes" ariaLabel={`Courbe des demandes de compte sur ${months} mois`} />
                            </section>
                            <section className="modern-card min-w-0 flex-[1_1_320px] p-5">
                                <h3 className="font-bold text-ink">Membres actifs par rôle</h3>
                                <p className="mb-4 mt-1 text-sm text-ink-soft">{fmt(k.active_members)} membres actifs</p>
                                <RoleShare roles={stats.roles} />
                            </section>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-4">
                            <section className="modern-card min-w-0 flex-[999_1_560px] p-5">
                                <h3 className="font-bold text-ink">Consultations de documents par mois</h3>
                                <p className="mb-3 mt-1 text-sm text-ink-soft">{months} derniers mois</p>
                                <MonthlyChart type="bar" labels={stats.series.labels} values={stats.series.consultations} unit="consultations" ariaLabel={`Histogramme des consultations sur ${months} mois`} />
                            </section>
                            <section className="modern-card min-w-0 flex-[1_1_320px] p-5">
                                <h3 className="font-bold text-ink">Documents les plus consultés</h3>
                                <p className="mb-4 mt-1 text-sm text-ink-soft">{months} derniers mois</p>
                                <HBarList items={stats.top_documents.map((d) => ({ label: d.title, value: d.views }))} />
                            </section>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-4">
                            <section className="modern-card min-w-0 flex-[999_1_560px] p-5">
                                <h3 className="font-bold text-ink">Questions posées à l'IA par mois</h3>
                                <p className="mb-3 mt-1 text-sm text-ink-soft">{months} derniers mois</p>
                                <MonthlyChart type="bar" labels={stats.series.labels} values={stats.series.ai_queries} unit="questions" ariaLabel={`Histogramme des questions à l'IA sur ${months} mois`} />
                            </section>
                            <section className="modern-card min-w-0 flex-[1_1_320px] p-5">
                                <h3 className="font-bold text-ink">Membres actifs par établissement</h3>
                                <p className="mb-4 mt-1 text-sm text-ink-soft">Mêmes codes que les numéros de demande</p>
                                <HBarList items={stats.establishments.map((e) => ({ label: e.code, value: e.members }))} />
                            </section>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
