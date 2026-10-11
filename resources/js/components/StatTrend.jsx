import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Skeleton } from "./Skeleton";

const TONE_STYLES = {
    indigo: "bg-indigo-50 text-indigo-800",
    brass: "bg-amber-50 text-brass-deep",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
};

const TREND_CLASS = {
    up: "bg-emerald-50 text-emerald-700",
    down: "bg-rose-50 text-rose-700",
    flat: "bg-slate-100 text-slate-600",
};
const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

/**
 * Carte stat avec icône colorée, chiffre, libellé et badge de tendance.
 * - `delta` (nombre) : % de variation ; auto-formatté « +12% vs mois dernier » ; direction déduite du signe.
 * - `deltaText` : texte libre, prioritaire sur `delta` ; `deltaDirection` donne alors la couleur (up/down/flat).
 */
export default function StatTrend({ icon: Icon, tone = "indigo", value, label, delta, deltaText, deltaDirection, to }) {
    const iconClasses = TONE_STYLES[tone] || TONE_STYLES.indigo;
    const Wrapper = to ? Link : "div";
    const wrapperProps = to ? { to } : {};
    const direction = deltaDirection ?? (delta === null || delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat");
    const text = deltaText ?? (delta === null || delta === undefined ? "Nouveau" : `${delta > 0 ? "+" : ""}${delta}% vs mois dernier`);
    const TrendIcon = TREND_ICON[direction];

    return (
        <Wrapper
            {...wrapperProps}
            className={`group flex h-full flex-col gap-2.5 rounded-xl border border-slate-200 bg-surface p-4 transition ${to ? "hover:border-indigo-300" : ""}`}
        >
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClasses}`}>
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
                <p className="font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink">{value}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-600">{label}</p>
            </div>
            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${TREND_CLASS[direction]}`}>
                <TrendIcon className="h-3 w-3" aria-hidden="true" />
                {text}
            </span>
        </Wrapper>
    );
}

export function StatTrendSkeleton() {
    return (
        <div aria-hidden="true" className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-surface p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-7 w-16 rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
            <Skeleton className="h-4 w-20 rounded-full" />
        </div>
    );
}
