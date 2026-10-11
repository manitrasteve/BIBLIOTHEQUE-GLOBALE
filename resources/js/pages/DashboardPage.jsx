import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    Eye,
    Sparkles,
    Bell,
    Heart,
    ArrowRight,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    BookOpen,
    PlayCircle,
    TrendingUp,
} from "lucide-react";
import { api } from "../lib/api";
import RecommendedReadings from "../components/RecommendedReadings";
import { usePageRefresh } from "../context/RefreshContext";
import { useAuth } from "../context/AuthContext";
import { Skeleton } from "../components/Skeleton";

const ROLE_LABELS = {
    etudiant: "Étudiant",
    enseignant: "Enseignant",
    chercheur: "Chercheur",
    autres: "Autres",
    bibliothecaire: "Service Numérique",
    administrateur: "Administrateur",
};

// Palette de 4 couleurs réutilisée pour le donut des domaines et les cartes de lecture.
const DOMAIN_COLORS = ["#11116f", "#e4a525", "#216e3f", "#a4283a"];

export default function DashboardPage() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getMyDashboard()
            .then(setData)
            .catch(() => setError("Impossible de charger votre tableau de bord pour le moment."));
    }, []);
    usePageRefresh(() => api.getMyDashboard().then((d) => { setData(d); setError(null); }));

    const firstName = user?.name?.split(" ")[0] || "";
    const currentReadings = data?.current_readings || [];
    const resumeTarget = currentReadings[0];

    return (
        <div className="w-full px-0 py-0">
            {/* Bannière de bienvenue : navy avec dégradé + cercles dorés, pile de livres stylisée à droite */}
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-700 p-6 sm:p-9 text-white shadow-sm">
                <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-gold/15" aria-hidden="true" />
                <div className="pointer-events-none absolute bottom-[-80px] right-24 h-40 w-40 rounded-full bg-gold-soft/10" aria-hidden="true" />

                <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-soft">
                            {ROLE_LABELS[user?.role] || "Compte"}
                        </span>
                        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                            Bonjour, {firstName} <span aria-hidden="true">👋</span>
                        </h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-on-primary-soft sm:text-[15px]">
                            {currentReadings.length > 0
                                ? <>Vous avez <strong className="text-white">{currentReadings.length} lecture{currentReadings.length > 1 ? "s" : ""}</strong> en cours. Continuez sur votre élan&nbsp;!</>
                                : "Retrouvez ici vos consultations, vos favoris et vos activités récentes."}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2.5">
                            {resumeTarget ? (
                                <Link
                                    to={`/documents/${resumeTarget.slug}`}
                                    className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-indigo-900 shadow-sm transition hover:bg-gold-soft hover:text-indigo-900"
                                >
                                    Reprendre ma lecture
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            ) : (
                                <Link
                                    to="/recherche"
                                    className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-indigo-900 shadow-sm transition hover:bg-gold-soft"
                                >
                                    Parcourir le catalogue
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            )}
                            <Link
                                to="/mes-lectures"
                                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
                            >
                                Mes lectures
                            </Link>
                        </div>
                    </div>

                    {/* Pile de livres décorative (SVG inline, cohérente avec la charte or/navy) */}
                    <div className="hidden min-w-[180px] flex-col items-center gap-1.5 lg:flex" aria-hidden="true">
                        <span className="block h-5 w-28 rotate-[-3deg] rounded bg-gold" />
                        <span className="block h-5 w-32 rotate-[2deg] rounded bg-white" />
                        <span className="block h-5 w-24 rotate-[-1deg] rounded bg-gold-deep" />
                        <span className="mt-1 flex h-16 w-32 items-center justify-center rounded-md bg-white/95">
                            <BookOpen className="h-8 w-8 text-indigo-900" strokeWidth={1.5} />
                        </span>
                    </div>
                </div>
            </section>

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
                    {/* 4 cartes stat avec badges de tendance (couleurs variées, pastilles + / - / stable) */}
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatTrend
                            icon={Eye}
                            tone="indigo"
                            value={data.month_consultations ?? 0}
                            label="Consultations ce mois"
                            delta={data.month_consultations_delta}
                            to="/mes-consultations"
                        />
                        <StatTrend
                            icon={Sparkles}
                            tone="brass"
                            value={data.month_ai_queries ?? 0}
                            label="Questions à l'IA ce mois"
                            delta={data.month_ai_queries_delta}
                            to="/mes-activites"
                        />
                        <StatTrend
                            icon={Heart}
                            tone="rose"
                            value={data.favorites ?? 0}
                            label="Favoris"
                            deltaText={data.month_new_favorites > 0 ? `+${data.month_new_favorites} ce mois` : "Stable"}
                            deltaDirection={data.month_new_favorites > 0 ? "up" : "flat"}
                            to="/mes-favoris"
                        />
                        <StatTrend
                            icon={Bell}
                            tone="emerald"
                            value={data.unread_notifications ?? 0}
                            label="Notifications non lues"
                            deltaText={data.unread_notifications > 0 ? "À consulter" : "Tout est à jour"}
                            deltaDirection={data.unread_notifications > 0 ? "up" : "flat"}
                            to="/notifications"
                        />
                    </div>

                    {/* Zone principale : 2 colonnes (gauche : lectures + courbe, droite : donut + recommandées) */}
                    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <div className="flex flex-col gap-5">
                            {currentReadings.length > 0 && <CurrentReadings items={currentReadings} />}
                            <ActivityChart activity={data.activity || []} />
                        </div>

                        <div className="flex flex-col gap-5">
                            <TopDomains categories={data.top_categories || []} />
                            {user?.role === "etudiant" && <RecommendedReadings />}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Teinte de carte stat : icône (fond + couleur) et accent du chiffre.
const TONE_STYLES = {
    indigo: { icon: "bg-indigo-50 text-indigo-800", value: "text-ink" },
    brass: { icon: "bg-amber-50 text-brass-deep", value: "text-ink" },
    rose: { icon: "bg-rose-50 text-rose-700", value: "text-ink" },
    emerald: { icon: "bg-emerald-50 text-emerald-700", value: "text-ink" },
};

function StatTrend({ icon: Icon, tone = "indigo", value, label, delta, deltaText, deltaDirection, to }) {
    const styles = TONE_STYLES[tone] || TONE_STYLES.indigo;
    const Wrapper = to ? Link : "div";
    const wrapperProps = to ? { to } : {};
    const direction = deltaDirection ?? (delta === null || delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat");
    const text = deltaText ?? (delta === null || delta === undefined ? "Nouveau" : `${delta > 0 ? "+" : ""}${delta}% vs mois dernier`);
    const trendClass = {
        up: "bg-emerald-50 text-emerald-700",
        down: "bg-rose-50 text-rose-700",
        flat: "bg-slate-100 text-slate-600",
    }[direction];
    const TrendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }[direction];

    return (
        <Wrapper
            {...wrapperProps}
            className={`group flex h-full flex-col gap-2.5 rounded-xl border border-slate-200 bg-surface p-4 transition ${to ? "hover:border-indigo-300" : ""}`}
        >
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${styles.icon}`}>
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
                <p className={`font-display text-2xl font-extrabold tabular-nums tracking-tight ${styles.value}`}>{value}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-600">{label}</p>
            </div>
            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${trendClass}`}>
                <TrendIcon className="h-3 w-3" aria-hidden="true" />
                {text}
            </span>
        </Wrapper>
    );
}

function StatTrendSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-surface p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-7 w-16 rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
            <Skeleton className="h-4 w-20 rounded-full" />
        </div>
    );
}

// Type → libellé affiché en surtitre de la carte de lecture.
const TYPE_LABELS = { livre: "Livre", memoire: "Mémoire", these: "Thèse", rapport: "Rapport", autre: "Document" };

function CurrentReadings({ items }) {
    return (
        <section className="rounded-xl border border-slate-200 bg-surface p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-extrabold text-ink">Mes lectures en cours</h2>
                <Link to="/mes-lectures" className="text-xs font-bold text-brass hover:text-brass-deep">Voir tout →</Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((reading, index) => {
                    const color = DOMAIN_COLORS[index % DOMAIN_COLORS.length];
                    const typeLabel = TYPE_LABELS[reading.type] || reading.type || "Document";
                    const percent = reading.percent ?? null;

                    return (
                        <li key={reading.slug} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-surface p-3">
                            <div className="flex h-20 items-center justify-center rounded-lg" style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, -15)})` }}>
                                <BookOpen className="h-7 w-7 text-gold-soft" strokeWidth={1.5} aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brass">{typeLabel}</p>
                                <p className="mt-0.5 line-clamp-2 text-sm font-bold text-ink">{reading.title}</p>
                            </div>
                            {percent !== null && (
                                <div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: `linear-gradient(90deg, ${color}, ${shade(color, 20)})` }} />
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-slate-600">
                                        <strong className="text-ink">{percent} %</strong>
                                        {reading.total_pages ? ` · page ${reading.last_page} / ${reading.total_pages}` : ""}
                                    </p>
                                </div>
                            )}
                            <Link
                                to={`/documents/${reading.slug}`}
                                className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-50 py-1.5 text-[12px] font-bold text-indigo-800 hover:bg-indigo-100"
                            >
                                <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Reprendre
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

// Assombrit (negative) ou éclaircit (positive) une couleur hex de ±N %, pour les dégradés.
function shade(hex, percent) {
    const h = hex.replace("#", "");
    const num = parseInt(h, 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0xff) + Math.round(255 * (percent / 100));
    let b = (num & 0xff) + Math.round(255 * (percent / 100));
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function ActivityChart({ activity }) {
    const total = activity.reduce((sum, point) => sum + (point.consultations || 0), 0);
    const max = Math.max(1, ...activity.map((point) => point.consultations || 0));

    // Génère un path SVG lissé par courbes de Catmull-Rom simplifiées (interpolation naturelle).
    const { linePath, areaPath, lastPoint } = useMemo(() => {
        if (activity.length === 0) return { linePath: "", areaPath: "", lastPoint: null };
        const width = 600;
        const height = 140;
        const stepX = width / Math.max(1, activity.length - 1);
        const points = activity.map((point, i) => ({
            x: i * stepX,
            y: height - 10 - ((point.consultations || 0) / max) * (height - 20),
        }));

        let line = `M${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const current = points[i];
            const midX = (prev.x + current.x) / 2;
            line += ` C${midX},${prev.y} ${midX},${current.y} ${current.x},${current.y}`;
        }
        const area = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;
        return { linePath: line, areaPath: area, lastPoint: points[points.length - 1] };
    }, [activity, max]);

    return (
        <section className="rounded-xl border border-slate-200 bg-surface p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-extrabold text-ink">Activité des 30 derniers jours</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{total} consultation{total > 1 ? "s" : ""} au total</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    Vue d'ensemble
                </span>
            </div>

            {total > 0 ? (
                <>
                    <svg viewBox="0 0 600 140" preserveAspectRatio="none" className="h-32 w-full" aria-label={`Courbe des consultations sur 30 jours (${total} au total)`}>
                        <defs>
                            <linearGradient id="dashChartFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#11116f" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#11116f" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={areaPath} fill="url(#dashChartFill)" />
                        <path d={linePath} fill="none" stroke="#11116f" strokeWidth="2.5" strokeLinecap="round" />
                        {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill="#e4a525" stroke="#ffffff" strokeWidth="2" />}
                    </svg>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                        <span>Il y a 30 j</span>
                        <span>Il y a 15 j</span>
                        <span>Aujourd'hui</span>
                    </div>
                </>
            ) : (
                <p className="py-10 text-center text-sm text-slate-500">
                    Aucune consultation sur les 30 derniers jours.
                </p>
            )}
        </section>
    );
}

function TopDomains({ categories }) {
    const total = categories.reduce((sum, category) => sum + category.count, 0);

    if (categories.length === 0) {
        return (
            <section className="rounded-xl border border-slate-200 bg-surface p-5 sm:p-6">
                <h2 className="font-display text-base font-extrabold text-ink">Mes domaines</h2>
                <p className="mt-3 text-sm text-slate-500">Vos domaines favoris apparaîtront ici après vos premières consultations.</p>
            </section>
        );
    }

    // Donut SVG : chaque segment part de l'offset courant (en « unités » sur 100).
    let offset = 25; // décalage initial pour que le premier segment commence en haut
    const segments = categories.map((category, i) => {
        const percent = Math.round((category.count / total) * 100);
        const color = DOMAIN_COLORS[i % DOMAIN_COLORS.length];
        const segment = { color, percent, dashArray: `${percent} ${100 - percent}`, dashOffset: offset };
        offset = (offset - percent + 100) % 100;
        return { ...category, ...segment };
    });

    return (
        <section className="rounded-xl border border-slate-200 bg-surface p-5 sm:p-6">
            <h2 className="mb-4 font-display text-base font-extrabold text-ink">Mes domaines favoris</h2>

            <div className="flex items-center gap-5">
                <div className="relative h-32 w-32 shrink-0">
                    <svg viewBox="0 0 42 42" className="h-full w-full">
                        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--color-line)" strokeWidth="5" />
                        {segments.map((segment, i) => (
                            <circle
                                key={i}
                                cx="21"
                                cy="21"
                                r="15.915"
                                fill="none"
                                stroke={segment.color}
                                strokeWidth="5"
                                strokeDasharray={segment.dashArray}
                                strokeDashoffset={segment.dashOffset}
                                transform="rotate(-90 21 21)"
                            />
                        ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-display text-xl font-extrabold text-ink">{total}</span>
                        <span className="text-[10px] font-semibold text-slate-500">consultation{total > 1 ? "s" : ""}</span>
                    </div>
                </div>

                <ul className="flex-1 space-y-2 text-xs">
                    {segments.map((segment) => (
                        <li key={segment.name} className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-slate-700">{segment.name}</span>
                            <strong className="tabular-nums text-ink">{segment.percent}%</strong>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
