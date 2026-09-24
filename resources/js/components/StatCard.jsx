import { Link } from "react-router-dom";
import { Skeleton } from "./Skeleton";

const TONE_STYLES = {
    default: {
        icon: "bg-indigo-50 text-brass-deep",
        value: "text-slate-900",
    },
    warning: {
        icon: "bg-amber-50 text-amber-700",
        value: "text-amber-700",
    },
    danger: {
        icon: "bg-rose-50 text-rose-700",
        value: "text-rose-700",
    },
    success: {
        icon: "bg-emerald-50 text-emerald-700",
        value: "text-emerald-700",
    },
};

export default function StatCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = "default",
    to,
}) {
    const styles = TONE_STYLES[tone] || TONE_STYLES.default;
    const Wrapper = to ? Link : "div";
    const wrapperProps = to ? { to } : {};

    return (
        <Wrapper
            {...wrapperProps}
            className={`group flex h-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-surface p-4 ${to ? "cursor-pointer transition hover:border-indigo-300" : ""}`}
        >
            <div className="min-w-0">
                <p
                    className={`font-display text-2xl font-extrabold tabular-nums tracking-tight ${styles.value}`}
                >
                    {value}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    {label}
                </p>
                {hint && (
                    <p className="mt-1 text-[11px] font-medium text-slate-500 group-hover:text-brass">
                        {hint}
                    </p>
                )}
            </div>
            {Icon && (
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
                >
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </span>
            )}
        </Wrapper>
    );
}

// Même gabarit que StatCard, affiché pendant le chargement des chiffres.
export function StatCardSkeleton() {
    return (
        <div aria-hidden="true" className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-surface p-4">
            <div className="flex-1">
                <Skeleton className="block h-7 w-12 rounded" />
                <Skeleton className="mt-2 block h-3 w-3/4 rounded" />
                <Skeleton className="mt-2 block h-3 w-1/2 rounded" />
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        </div>
    );
}
