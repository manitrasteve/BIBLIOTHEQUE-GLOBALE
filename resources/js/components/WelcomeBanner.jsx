import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Bannière de bienvenue chaleureuse (navy en dégradé) utilisée en tête des tableaux de bord.
 * `primary` et `secondary` prennent `{ label, to }` ; `secondary` est optionnel.
 */
export default function WelcomeBanner({ eyebrow, title, description, primary, secondary }) {
    return (
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-700 p-6 text-white shadow-sm sm:p-9">
            <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-gold/15" aria-hidden="true" />
            <div className="pointer-events-none absolute bottom-[-80px] right-24 h-40 w-40 rounded-full bg-gold-soft/10" aria-hidden="true" />

            <div className="relative">
                {eyebrow && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-soft">
                        {eyebrow}
                    </span>
                )}
                <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {title}
                </h1>
                {description && (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-on-primary-soft sm:text-[15px]">
                        {description}
                    </p>
                )}
                {(primary || secondary) && (
                    <div className="mt-5 flex flex-wrap gap-2.5">
                        {primary && (
                            <Link
                                to={primary.to}
                                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-indigo-900 shadow-sm transition hover:bg-gold-soft"
                            >
                                {primary.label}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        )}
                        {secondary && (
                            <Link
                                to={secondary.to}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
                            >
                                {secondary.label}
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
