import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
    Ticket,
    FileText,
    Landmark,
    LayoutDashboard,
    LibraryBig,
    Mail,
    MessageCircle,
    UserPlus,
    Menu,
    X,
    Trash2,
    Building2,
    BarChart3,
    Heart,
    MessageSquare,
    LifeBuoy,
    Activity,
} from "lucide-react";
import Footer from "./Footer";
import { useAuth } from "../context/AuthContext";
import { useDrawerScrollLock } from "../lib/useDrawerScrollLock";

const NAV = [
    {
        to: "/bibliothecaire/tableau-de-bord",
        label: "Tableau de bord",
        icon: LayoutDashboard,
    },
    {
        to: "/bibliothecaire/catalogue",
        label: "Catalogue",
        icon: LibraryBig,
    },
    {
        to: "/bibliothecaire/tickets-comptes",
        label: "Demandes de compte",
        icon: Ticket,
    },
    {
        to: "/bibliothecaire/creer-demande-compte",
        label: "Ajouter un utilisateur",
        icon: UserPlus,
        permission: "ajouter_utilisateur",
        // L'administrateur ajoute les utilisateurs depuis Administration → Utilisateurs.
        hideForAdmin: true,
    },
    {
        to: "/bibliothecaire/documents",
        label: "Documents",
        icon: FileText,
    },
    {
        to: "/bibliothecaire/bibliotheques",
        label: "Ajouter une bibliothèque",
        icon: Building2,
        permission: "ajouter_bibliotheque",
        // L'administrateur gère les bibliothèques depuis Administration → Bibliothèques.
        hideForAdmin: true,
    },
    {
        to: "/bibliothecaire/corbeille",
        label: "Corbeille",
        icon: Trash2,
        permission: "voir_corbeille",
        // L'administrateur utilise Administration → Corbeille (même page, même API).
        hideForAdmin: true,
    },
    // Consultation en lecture seule : l'administrateur les trouve dans Administration.
    {
        to: "/bibliothecaire/statistiques",
        label: "Statistiques",
        icon: BarChart3,
        permission: "voir_statistiques",
        hideForAdmin: true,
    },
    {
        to: "/bibliothecaire/popularite",
        label: "Popularité",
        icon: Heart,
        permission: "voir_popularite",
        hideForAdmin: true,
    },
    {
        to: "/bibliothecaire/avis",
        label: "Avis des utilisateurs",
        icon: MessageSquare,
        permission: "voir_avis_utilisateurs",
        hideForAdmin: true,
    },
    {
        to: "/bibliothecaire/signalements",
        label: "Signalements",
        icon: LifeBuoy,
        permission: "voir_signalements",
        hideForAdmin: true,
    },
    { to: "/bibliothecaire/activites", label: "Mes activités", icon: Activity },
    { to: "/bibliothecaire/messages", label: "Messages", icon: Mail },
    {
        to: "/bibliothecaire/discussions",
        label: "Discussion avec l’administrateur",
        icon: MessageCircle,
    },
];

export default function LibrarianLayout() {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const navigationId = useId();
    const { user } = useAuth();

    useDrawerScrollLock(open);

    const nav = NAV.filter((item) => {
        if (item.hideForAdmin && user?.role === "administrateur") return false;
        if (!item.permission && !item.permissions) return true;
        if (user?.role === "administrateur") return true;
        if (item.permission) return user?.permissions?.includes(item.permission);
        return item.permissions?.some((permission) => user?.permissions?.includes(permission));
    });

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
                    className="fixed inset-0 z-40 cursor-default bg-slate-950/20 lg:hidden"
                    aria-label="Fermer le menu de navigation"
                    onClick={() => setOpen(false)}
                />
            )}

            <nav
                id={navigationId}
                aria-label="Navigation de l'espace bibliothécaire"
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
                                    : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
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
                        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                            <Landmark className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-indigo-600">
                                Espace Service Numérique
                            </p>
                            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                                Gestion de la Bibliothèque Globale
                            </h1>
                        </div>
                    </div>

                    <div className="mb-4 flex justify-end lg:hidden">
                        <button
                            type="button"
                            onClick={() => setOpen((value) => !value)}
                            className="btn-secondary"
                            aria-expanded={open}
                            aria-controls={navigationId}
                        >
                            {open ? (
                                <X className="h-4 w-4" />
                            ) : (
                                <Menu className="h-4 w-4" />
                            )}{" "}
                            {open ? "Fermer le menu" : "Menu"}
                        </button>
                    </div>

                    <Outlet />
                </div>
                <Footer />
            </section>
        </div>
    );
}
