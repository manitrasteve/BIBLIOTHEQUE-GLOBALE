import { Link } from "react-router-dom";

const TONE_STYLES = {
    default: {
        icon: "bg-indigo-50 text-indigo-700",
        value: "text-slate-900",
        ring: "ring-indigo-100",
    },
    warning: {
        icon: "bg-amber-50 text-amber-700",
        value: "text-amber-700",
        ring: "ring-amber-100",
    },
    danger: {
        icon: "bg-rose-50 text-rose-700",
        value: "text-rose-700",
        ring: "ring-rose-100",
    },
    success: {
        icon: "bg-emerald-50 text-emerald-700",
        value: "text-emerald-700",
        ring: "ring-emerald-100",
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
            className={`group relative block overflow-hidden rounded-xl border border-slate-200 bg-white p-4 ${to ? "transition hover:border-indigo-300 cursor-pointer" : ""}`}
        >
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-50/70 transition-transform duration-300 group-hover:scale-125" />
            <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p
                        className={`font-display text-2xl font-extrabold tracking-tight ${styles.value}`}
                    >
                        {value}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                        {label}
                    </p>
                    {hint && (
                        <p className="mt-1 text-[11px] font-medium text-indigo-600">
                            {hint}
                        </p>
                    )}
                </div>
                {Icon && (
                    <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${styles.icon} ring-8 ${styles.ring}`}
                    >
                        <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                )}
            </div>
        </Wrapper>
    );
}
