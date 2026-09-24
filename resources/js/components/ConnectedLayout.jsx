import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useDrawerScrollLock } from "../lib/useDrawerScrollLock";

export default function ConnectedLayout({ badge: BadgeIcon, eyebrow, title, nav }) {
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
                    className="fixed inset-0 z-40 cursor-default bg-black/20 lg:hidden"
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
                    <span className="text-sm font-bold text-slate-900">Navigation</span>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="btn-secondary !px-3 !py-2"
                        aria-label="Fermer le menu"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                {nav.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                            `relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all ${
                                isActive
                                    ? "bg-indigo-600 font-bold text-white"
                                    : "text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                            }`
                        }
                    >
                        <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                        {item.label}
                    </NavLink>
                ))}
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

                    <Outlet />
                </div>
            </section>
        </div>
    );
}
