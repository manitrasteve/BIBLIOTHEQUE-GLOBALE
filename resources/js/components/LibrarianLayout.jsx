import { useEffect, useId, useState, Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import PageLoader from "./PageLoader";
import RefreshButton from "./RefreshButton";
import NavBadge, { useNavBadges } from "./NavBadge";
import { RefreshProvider } from "../context/RefreshContext";
import {
    Ticket,
    FileText,
    Landmark,
    LayoutDashboard,
    LibraryBig,
    Mail,
    MessageCircle,
    GraduationCap,
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
    Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDrawerScrollLock } from "../lib/useDrawerScrollLock";

// Ordre logique (même logique que l'espace administrateur) : pilotage → contenu → comptes → suivi des usagers
// → communication → traçabilité, la Corbeille en dernier.
const NAV = [
    // Pilotage
    {
        to: "/bibliothecaire/tableau-de-bord",
        label: "Tableau de bord",
        icon: LayoutDashboard,
    },
    {
        to: "/bibliothecaire/statistiques",
        label: "Statistiques",
        icon: BarChart3,
        permission: "voir_statistiques",
        hideForAdmin: true,
    },
    // Limité à la bibliothèque du compte ; l'administrateur a sa propre page.
    { to: "/bibliothecaire/assistant", label: "Assistant IA", icon: Sparkles, hideForAdmin: true },
    // Contenu
    {
        to: "/bibliothecaire/catalogue",
        label: "Catalogue",
        icon: LibraryBig,
    },
    {
        to: "/bibliothecaire/documents",
        label: "Documents",
        icon: FileText,
        badge: ["submissions", "drafts"],
    },
    {
        to: "/bibliothecaire/bibliotheques",
        label: "Bibliothèques",
        icon: Building2,
        // Visible dès qu'une des trois permissions de la catégorie « Bibliothèques » est accordée.
        permissions: ["voir_bibliotheques", "ajouter_bibliotheque", "modifier_bibliotheque"],
        // L'administrateur gère les bibliothèques depuis Administration → Bibliothèques.
        hideForAdmin: true,
    },
    // Comptes
    {
        to: "/bibliothecaire/tickets-comptes",
        label: "Demandes de compte",
        icon: Ticket,
        badge: "account_requests",
    },
    {
        to: "/bibliothecaire/creer-demande-compte",
        label: "Ajouter un utilisateur",
        icon: UserPlus,
        permission: "ajouter_utilisateur",
        // L'administrateur ajoute les utilisateurs depuis Administration → Utilisateurs.
        hideForAdmin: true,
    },
    // Classes attribuées aux enseignants (public de leurs bibliographies de cours).
    {
        to: "/bibliothecaire/enseignants",
        label: "Enseignants et classes",
        icon: GraduationCap,
        badge: "class_requests",
        hideForAdmin: true,
    },
    // Suivi des usagers (lecture seule : l'administrateur les trouve dans Administration)
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
        badge: "feedbacks",
        permission: "voir_avis_utilisateurs",
        hideForAdmin: true,
    },
    {
        to: "/bibliothecaire/signalements",
        label: "Signalements",
        icon: LifeBuoy,
        badge: "reports",
        permission: "voir_signalements",
        hideForAdmin: true,
    },
    // Communication
    { to: "/bibliothecaire/messages", label: "Messages", icon: Mail },
    {
        to: "/bibliothecaire/discussions",
        label: "Discussion avec l’administrateur",
        icon: MessageCircle,
        badge: "staff_messages",
    },
    // Traçabilité, la Corbeille en dernier
    { to: "/bibliothecaire/activites", label: "Mes activités", icon: Activity },
    {
        to: "/bibliothecaire/corbeille",
        label: "Corbeille",
        icon: Trash2,
        badge: "trash",
        permission: "voir_corbeille",
        // L'administrateur utilise Administration → Corbeille (même page, même API).
        hideForAdmin: true,
    },
];

// Le contexte d'actualisation englobe aussi le menu : ses badges se rechargent après « Actualiser ».
export default function LibrarianLayout() {
    return (
        <RefreshProvider>
            <LibrarianLayoutContent />
        </RefreshProvider>
    );
}

function LibrarianLayoutContent() {
    const badges = useNavBadges();
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
                    className="fixed inset-0 z-40 cursor-default bg-overlay lg:hidden"
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
                                    : "text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
                                {item.label}
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
            </nav>

            <section className="connected-main">
                <div className="w-full flex-1 px-4 py-4 sm:px-6 sm:py-5 xl:px-8">
                    <div className="mb-4 flex items-center gap-3">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white sm:h-12 sm:w-12 sm:rounded-2xl">
                            <Landmark className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-brass">
                                Espace Service Numérique
                            </p>
                            <h1 className="font-display text-xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                                Gestion de la Bibliothèque Globale
                            </h1>
                        </div>

                        <RefreshButton />

                        {/* Mobile : le bouton du tiroir reste sur la ligne du titre, sans ligne vide dédiée. */}
                        <button
                            type="button"
                            onClick={() => setOpen((value) => !value)}
                            className="btn-secondary shrink-0 lg:!hidden"
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

                    <Suspense fallback={<PageLoader />}>
                        <Outlet />
                    </Suspense>
                </div>
            </section>
        </div>
    );
}
