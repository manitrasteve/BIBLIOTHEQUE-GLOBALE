import { useEffect, useId, useState, Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import PageLoader from "./PageLoader";
import RefreshButton from "./RefreshButton";
import NavBadge, { useNavBadges } from "./NavBadge";
import { RefreshProvider } from "../context/RefreshContext";
import { useDrawerScrollLock } from "../lib/useDrawerScrollLock";

// Le contexte d'actualisation englobe aussi le menu : ses badges se rechargent après « Actualiser ».
export default function ConnectedLayout(props) {
    return (
        <RefreshProvider>
            <ConnectedLayoutContent {...props} />
        </RefreshProvider>
    );
}

function ConnectedLayoutContent({ badge: BadgeIcon, eyebrow, title, nav }) {
    const badges = useNavBadges();
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const navigationId = useId();

    useDrawerScrollLock(open);

    useEffect(() => setOpen(false), [location.pathname]);
    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, []);

    return (
        <div className="connected-layout">
            {open && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-overlay lg:hidden"
                    aria-label="Fermer le menu de navigation"
                    onClick={() => setOpen(false)}
                />
            )}

            <nav
                id={navigationId}
                aria-label="Navigation de l'espace connecté"
                className={`connected-sidebar ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
            >
                <div className="mb-2 flex items-center justify-between px-2 lg:hidden">
                    <span className="text-sm font-bold text-white">Navigation</span>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                        aria-label="Fermer le menu"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                    {nav.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                                `group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all ${
                                    isActive
                                        ? "bg-white font-bold text-indigo-900 shadow-sm"
                                        : "text-indigo-100/90 hover:bg-white/10 hover:text-white"
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    {/* Indicateur or à gauche de l'item actif. */}
                                    {isActive && (
                                        <span aria-hidden="true" className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-gold" />
                                    )}
                                    <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                                    <span className="truncate">{item.label}</span>
                                    {/* `badge` : une rubrique, ou plusieurs (ex. dépôts à vérifier + brouillons). */}
                                    <span className="ml-auto flex shrink-0 gap-1">
                                        {[].concat(item.badge || []).map((name) => (
                                            <NavBadge key={name} name={name} count={badges[name]} active={isActive} />
                                        ))}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>

            </nav>

            <section className="connected-main">
                <div className="w-full flex-1 px-4 py-4 sm:px-6 sm:py-5 xl:px-8">
                    <div className="mb-4 flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white sm:h-12 sm:w-12 sm:rounded-2xl">
                            <BadgeIcon className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-brass">
                                {eyebrow}
                            </p>
                            <h1 className="font-display text-xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                                {title}
                            </h1>
                        </div>

                        <RefreshButton />

                        {/* Mobile : le bouton du tiroir reste sur la ligne du titre, sans ligne vide dédiée. */}
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            className="btn-secondary shrink-0 lg:!hidden"
                            aria-expanded={open}
                            aria-controls={navigationId}
                        >
                            <Menu className="h-4 w-4" aria-hidden="true" />
                            Menu
                        </button>
                    </div>

                    <Suspense fallback={<PageLoader />}>
                        <Outlet />
                    </Suspense>
                </div>
            </section>
        </div>
    );
}
