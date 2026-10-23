import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import UserAvatar from "./UserAvatar";

/**
 * Bannière de bienvenue en tête des tableaux de bord, entièrement bleu nuit : photo de profil de
 * l'utilisateur connecté (icône de personne sans photo), texte, puis actions à droite.
 * `primary` et `secondary` prennent `{ label, to }` ; `secondary` est optionnel.
 */
export default function WelcomeBanner({ eyebrow, title, description, primary, secondary }) {
    const { user } = useAuth();

    return (
        <section className="relative overflow-hidden rounded-2xl bg-umg-night px-5 py-6 text-white shadow-sm sm:px-9 sm:py-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                    <div className="relative w-fit shrink-0">
                        <UserAvatar user={user} size="h-24 w-24 sm:h-32 sm:w-32 ring-4 ring-white/25" />
                        {/* Pastille « en ligne » : l'utilisateur qui voit son tableau de bord est connecté. */}
                        <span
                            title="En ligne"
                            className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-[3px] border-umg-night bg-emerald-500 sm:bottom-2 sm:right-2 sm:h-6 sm:w-6"
                        >
                            <span className="sr-only">En ligne</span>
                        </span>
                    </div>
                    <div className="min-w-0">
                        {eyebrow && (
                            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-soft">
                                {eyebrow}
                            </span>
                        )}
                        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                            {title}
                        </h1>
                        {description && (
                            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-on-primary-soft sm:text-[15px]">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                {(primary || secondary) && (
                    // Mobile : boutons empilés pleine largeur, l'action principale en haut.
                    <div className="flex shrink-0 flex-col-reverse gap-2.5 sm:flex-row">
                        {secondary && (
                            <Link
                                to={secondary.to}
                                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/30 px-4 text-sm font-bold text-white transition hover:bg-white/10"
                            >
                                {secondary.label}
                            </Link>
                        )}
                        {primary && (
                            <Link
                                to={primary.to}
                                onClick={primary.onClick}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#e4a525] px-4 text-sm font-bold text-umg-night shadow-sm transition hover:brightness-95"
                            >
                                {primary.label}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
