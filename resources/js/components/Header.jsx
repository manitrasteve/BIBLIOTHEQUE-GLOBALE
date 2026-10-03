import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    UserPlus,
    User,
    ChevronDown,
    LayoutDashboard,
    ShieldCheck,
    LogOut,
    LogIn,
    Menu,
    X,
    Settings,
    LayoutTemplate,
    Palette,
    LibraryBig,
    Home,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { isWorkspacePath } from "../lib/layout";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

// Libellés affichés sous le nom (valeurs réelles de users.role).
const ROLE_LABELS = {
    administrateur: "Administrateur",
    admin: "Administrateur",
    bibliothecaire: "Bibliothécaire",
    etudiant: "Étudiant",
    enseignant: "Enseignant",
    chercheur: "Chercheur",
    autres: "Autres",
    autre: "Autres",
};

// Paramètres de l'administrateur (sous-menu du menu de profil).
const SETTINGS_PATH = "/administrateur/parametres";
const SETTINGS_LINKS = [
    { to: "/administrateur/parametres/page-accueil", label: "Modifier la page d'accueil", icon: LayoutTemplate },
    { to: "/administrateur/parametres/apparence", label: "Apparence du site", icon: Palette },
];

// Petit menu déroulant de la photo de profil : Profil + (Paramètres pour l'admin) + Déconnexion
function ProfileMenu({ user, pathname, openLogoutModal, settingsReturnTo }) {
    const roleLabel =
        ROLE_LABELS[user?.role] ||
        (user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "");
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const isAdmin = user?.role === "administrateur" || user?.role === "admin";
    const inSettings = pathname.startsWith(SETTINGS_PATH);
    const [settingsOpen, setSettingsOpen] = useState(inSettings);
    const ref = useRef(null);

    // Un clic ouvre le sous-menu, un second clic le referme. Si une page des paramètres est
    // affichée, ce second clic la ferme aussi et ramène à la dernière page consultée avant.
    function toggleSettings() {
        if (settingsOpen && inSettings) {
            setSettingsOpen(false);
            setOpen(false);
            navigate(settingsReturnTo.current || "/administrateur");
            return;
        }
        setSettingsOpen((value) => !value);
    }

    useEffect(() => {
        function handleClickOutside(event) {
            if (ref.current && !ref.current.contains(event.target)) {
                setOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    // Fermer le menu lorsqu'on change de page
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // À chaque ouverture, le sous-menu Paramètres est déplié seulement si on est dedans.
    useEffect(() => {
        if (open) setSettingsOpen(inSettings);
    }, [open]);

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex items-center gap-0.5 rounded-full"
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label="Menu du profil"
            >
                <span className="relative h-9 w-9 shrink-0">
                    <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                        {user?.photo_url ? (
                            <img
                                src={user.photo_url}
                                alt="Photo de profil"
                                className="h-full w-full rounded-full object-cover"
                            />
                        ) : (
                            <span className="flex h-full w-full items-center justify-center rounded-full bg-blue-100 text-blue-700">
                                <User className="h-4 w-4" />
                            </span>
                        )}
                    </span>

                    {/* Indicateur UX : signale que la photo ouvre un menu (pas un statut) */}
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald-500"
                    />
                </span>

                {/* Nom + rôle (masqués sur téléphone : la photo seule reste, comme avant) */}
                <span className="ml-2 mr-1 hidden min-w-0 text-left sm:block">
                    <span
                        title={user?.name}
                        className="block max-w-[9rem] truncate text-sm font-bold leading-tight text-slate-900 lg:max-w-[12rem]"
                    >
                        {user?.name}
                    </span>
                    <span className="block max-w-[9rem] truncate text-xs leading-tight text-slate-500 lg:max-w-[12rem]">
                        {roleLabel}
                    </span>
                </span>

                {/* Indicateur UX : signale que la photo ouvre un menu */}
                <ChevronDown
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 text-slate-500 transition-transform ${
                        open ? "rotate-180" : ""
                    }`}
                />
            </button>

            {open && (
                <div
                    role="menu"
                    className={`absolute right-0 top-full z-50 mt-2 ${isAdmin ? "w-64" : "w-48"} max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-surface p-2`}
                >
                    <Link
                        to="/profil"
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                        <User className="h-4 w-4" />
                        Profil
                    </Link>

                    {isAdmin && (
                        <>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={toggleSettings}
                                aria-expanded={settingsOpen}
                                className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold hover:bg-slate-100 hover:text-slate-900 ${
                                    inSettings ? "text-brass-deep" : "text-slate-600"
                                }`}
                            >
                                <Settings className="h-4 w-4" />
                                Paramètres
                                <ChevronDown
                                    aria-hidden="true"
                                    className={`ml-auto h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                                />
                            </button>
                            {settingsOpen && (
                                <div className="mb-1 ml-5 border-l border-slate-200 pl-2">
                                    {SETTINGS_LINKS.map(({ to, label, icon: Icon }) => (
                                        <Link
                                            key={to}
                                            to={to}
                                            role="menuitem"
                                            onClick={() => setOpen(false)}
                                            className={`flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                                                pathname.startsWith(to)
                                                    ? "bg-indigo-600 text-white"
                                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                            }`}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            {label}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            openLogoutModal();
                        }}
                        className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-rose-700 hover:bg-rose-50"
                    >
                        <LogOut className="h-4 w-4" />
                        Déconnexion
                    </button>
                </div>
            )}
        </div>
    );
}

export default function Header() {
    const { user, logout, isLoggingOut, openLogoutModal, cancelLogout } =
        useAuth();

    const navigate = useNavigate();
    const location = useLocation();

    // Dernière page consultée hors des Paramètres : on y revient en refermant les Paramètres.
    const settingsReturnTo = useRef(null);
    useEffect(() => {
        if (!location.pathname.startsWith(SETTINGS_PATH)) {
            settingsReturnTo.current = location.pathname + location.search;
        }
    }, [location.pathname, location.search]);

    // L'aperçu de la page d'accueil (administrateur) garde l'en-tête de l'accueil.
    const isHome = location.pathname === "/" || location.pathname === "/apercu-page-accueil";

    // Compte utilisateur (étudiant, enseignant, chercheur…) : son tableau de bord est /tableau-de-bord.
    // Administrateur et bibliothécaire ont leurs propres entrées (Administration / Gestion).
    const isMember =
        !!user && !["bibliothecaire", "administrateur"].includes(user.role);

    // Admin / bibliothécaire : « Catalogue » ouvre directement la recherche, pas la page d'accueil.
    const catalogueLink = user && !isMember ? "/recherche" : "/";
    // Libellé du menu : « Accueil » quand le lien mène à la page d'accueil, « Catalogue » vers la recherche.
    const catalogueLabel = catalogueLink === "/" ? "Accueil" : "Catalogue";

    const centeredHeader = !isWorkspacePath(location.pathname);

    // Visiteur (non connecté) : la barre affiche toujours ses liens (Catalogue / Accueil, S'inscrire, Connexion),
    // sur toutes les pages, sans menu ☰. Sur le catalogue, le premier lien ramène à l'accueil.
    const visitorOnCatalogue = location.pathname.startsWith("/recherche");

    const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const menuRef = useRef(null);

    // Fermer le menu si on clique à l'extérieur
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);

        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fermer le menu lorsqu'on change de page
    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    // Si l'utilisateur est déconnecté, fermer le menu
    useEffect(() => {
        if (!user) {
            setMenuOpen(false);
        }
    }, [user]);

    async function confirmLogout() {
        if (isConfirmingLogout) return;

        setIsConfirmingLogout(true);

        // Afficher "Déconnexion..." pendant 1 seconde
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
            await logout();

            setMenuOpen(false);

            // Retour à l'accueil
            navigate("/", { replace: true });
        } finally {
            setIsConfirmingLogout(false);
        }
    }

    function handleCancelLogout() {
        if (isConfirmingLogout) return;

        cancelLogout();
    }

    return (
        <>
            {/* ================= HEADER ================= */}
            <header
                className={`sticky top-0 z-40 border-b border-line bg-surface  ${
                    isLoggingOut ? "pointer-events-none" : ""
                }`}
            >
                {/* Pages publiques : contenu centré (charte UMG) ; espaces à barre latérale : pleine largeur. */}
                <div className={`${centeredHeader ? "umg-container" : "w-full px-4 sm:px-8 xl:px-10"} py-3 flex items-center justify-between gap-4`}>
                    {/* ================= LOGO ================= */}
                    <Link to="/" className="flex items-center gap-3 min-w-0">
                        {/* bg-[#ffffff] : pastille toujours blanche (le logo bleu reste visible en mode sombre) */}
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#ffffff] p-0.5">
                            <img
                                src="/images/logo-universite-mahajanga.png"
                                alt="Université de Mahajanga"
                                className="h-full w-full object-contain"
                            />
                        </span>

                        <span className="min-w-0 leading-tight">
                            {/* Visiteur sur téléphone : le logo seul, la barre (Catalogue, S'inscrire, Connexion) prend la place. */}
                            <span className={`${!user ? "hidden sm:block" : "block"} truncate font-display text-[15px] sm:text-[17px] font-bold tracking-tight text-ink`}>
                                Bibliothèque Globale
                            </span>

                            <span className="hidden sm:block text-[13px] font-medium text-ink-soft">
                                Université de Mahajanga
                            </span>
                        </span>
                    </Link>

                    {/* ================= ACTIONS ================= */}
                    <nav aria-label="Compte et outils" className="flex shrink-0 items-center gap-1.5 sm:gap-3 text-sm">

                        {/* =====================================================
                            DÉCONNECTÉ (toutes les pages : accueil, catalogue, inscription, connexion…)

                            Afficher :
                            Catalogue (ou Accueil sur le catalogue) + S'inscrire + 🌙 + Connexion

                            AUCUN ☰
                        ====================================================== */}
                        {!user ? (
                            <>
                                {/* Catalogue, ou Accueil sur le catalogue (icône seule sur téléphone, pour que la barre tienne en largeur) */}
                                <Link
                                    to={visitorOnCatalogue ? "/" : "/recherche"}
                                    title={visitorOnCatalogue ? "Accueil" : "Catalogue"}
                                    className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 sm:px-3 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                >
                                    {visitorOnCatalogue ? (
                                        <Home className="h-4 w-4 sm:hidden" aria-hidden="true" />
                                    ) : (
                                        <LibraryBig className="h-4 w-4 sm:hidden" aria-hidden="true" />
                                    )}
                                    <span className="sr-only sm:not-sr-only">{visitorOnCatalogue ? "Accueil" : "Catalogue"}</span>
                                </Link>

                                {/* S'inscrire */}
                                <Link
                                    to="/creer-un-compte"
                                    title="S’inscrire"
                                    className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 sm:px-3 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                >
                                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only sm:not-sr-only">S’inscrire</span>
                                </Link>

                                {/* Lune */}
                                <ThemeToggle />

                                {/* Connexion */}
                                <Link
                                    to="/connexion"
                                    className="btn-primary !rounded-xl !px-3 sm:!px-4 !py-2.5"
                                >
                                    <LogIn className="h-4 w-4" />
                                    Connexion
                                </Link>
                            </>
                        ) : isHome && user ? (
                            /* =====================================================
                               ACCUEIL + CONNECTÉ

                               🌙 + 🔔 + ☰
                            ====================================================== */

                            <>
                                {/* Lune */}
                                <ThemeToggle />

                                {/* Notifications */}
                                <NotificationBell
                                    isAdmin={user?.role === "administrateur"}
                                    isLibrarian={
                                        user?.role === "bibliothecaire"
                                    }
                                />

                                {/* Menu ☰ */}
                                <div className="relative" ref={menuRef}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setMenuOpen((value) => !value)
                                        }
                                        className="btn-secondary !rounded-xl !px-3 !py-2"
                                        aria-expanded={menuOpen}
                                        aria-label="Menu"
                                    >
                                        {menuOpen ? (
                                            <X className="h-4 w-4" />
                                        ) : (
                                            <Menu className="h-4 w-4" />
                                        )}
                                    </button>

                                    {menuOpen && (
                                        <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-surface p-2 ">
                                            {/* Accueil (membres) ou Catalogue (personnel) */}
                                            <Link
                                                to={catalogueLink}
                                                onClick={() =>
                                                    setMenuOpen(false)
                                                }
                                                className="flex items-center rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                            >
                                                {catalogueLabel}
                                            </Link>

                                            {/* Tableau de bord (comptes utilisateur) */}
                                            {isMember && (
                                                <Link
                                                    to="/tableau-de-bord"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                                >
                                                    <LayoutDashboard className="h-4 w-4" />
                                                    Tableau de bord
                                                </Link>
                                            )}

                                            {/* Gestion (bibliothécaire uniquement) */}
                                            {user.role === "bibliothecaire" && (
                                                <Link
                                                    to="/bibliothecaire"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                                >
                                                    <LayoutDashboard className="h-4 w-4" />
                                                    Gestion
                                                </Link>
                                            )}

                                            {/* Administration */}
                                            {user.role === "administrateur" && (
                                                <Link
                                                    to="/administrateur"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                    Administration
                                                </Link>
                                            )}

                                        </div>
                                    )}
                                </div>

                                {/* Photo de profil */}
                                <ProfileMenu
                                    user={user}
                                    pathname={location.pathname}
                                    openLogoutModal={openLogoutModal}
                                    settingsReturnTo={settingsReturnTo}
                                />
                            </>
                        ) : (
                            /* =====================================================
                               PAGES INTERNES (connecté) → 🌙 + 🔔 + ☰
                            ====================================================== */

                            <>
                                {/* Lune */}
                                <ThemeToggle />

                                {/* Notifications */}
                                {user && (
                                    <NotificationBell
                                        isAdmin={
                                            user?.role === "administrateur"
                                        }
                                        isLibrarian={
                                            user?.role === "bibliothecaire"
                                        }
                                    />
                                )}

                                {/* Menu ☰ */}
                                <div className="relative" ref={menuRef}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setMenuOpen((value) => !value)
                                        }
                                        className="btn-secondary !rounded-xl !px-3 !py-2"
                                        aria-expanded={menuOpen}
                                        aria-label="Menu"
                                    >
                                        {menuOpen ? (
                                            <X className="h-4 w-4" />
                                        ) : (
                                            <Menu className="h-4 w-4" />
                                        )}
                                    </button>

                                    {menuOpen && (
                                        <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-surface p-2 ">
                                            {/* Accueil (membres) ou Catalogue (personnel) */}
                                            <Link
                                                to={catalogueLink}
                                                onClick={() =>
                                                    setMenuOpen(false)
                                                }
                                                className="flex items-center rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                            >
                                                {catalogueLabel}
                                            </Link>

                                            {/* Tableau de bord (comptes utilisateur) */}
                                            {isMember && (
                                                <Link
                                                    to="/tableau-de-bord"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                                >
                                                    <LayoutDashboard className="h-4 w-4" />
                                                    Tableau de bord
                                                </Link>
                                            )}

                                            {/* Gestion (bibliothécaire uniquement) */}
                                            {user?.role === "bibliothecaire" && (
                                                    <Link
                                                        to="/bibliothecaire"
                                                        onClick={() =>
                                                            setMenuOpen(false)
                                                        }
                                                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                                    >
                                                        <LayoutDashboard className="h-4 w-4" />
                                                        Gestion
                                                    </Link>
                                                )}

                                            {/* Administration */}
                                            {user?.role ===
                                                "administrateur" && (
                                                <Link
                                                    to="/administrateur"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                    Administration
                                                </Link>
                                            )}

                                        </div>
                                    )}
                                </div>

                                {/* Photo de profil */}
                                {user && (
                                    <ProfileMenu
                                        user={user}
                                        pathname={location.pathname}
                                        openLogoutModal={openLogoutModal}
                                        settingsReturnTo={settingsReturnTo}
                                    />
                                )}
                            </>
                        )}
                    </nav>
                </div>
            </header>

            {/* =====================================================
                MODAL DE CONFIRMATION DE DÉCONNEXION
            ====================================================== */}

            {/* Rendu dans document.body : la fenêtre reste centrée dans l'écran,
                sans dépendre de la position de défilement de la page. */}
            {isLoggingOut && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-overlay px-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="logout-title"
                >
                    <div
                        className="w-full max-w-md rounded-3xl border border-slate-200 bg-surface p-4 "
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* Icône */}
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-brass">
                            <LogOut className="h-6 w-6" />
                        </div>

                        {/* Titre */}
                        <h2
                            id="logout-title"
                            className="mt-5 text-center font-display text-xl font-extrabold text-slate-900"
                        >
                            Voulez-vous vraiment vous déconnecter?
                        </h2>

                        {/* Boutons */}
                        <div className="mt-6 flex justify-center gap-3">
                            {/* Annuler */}
                            <button
                                type="button"
                                onClick={handleCancelLogout}
                                disabled={isConfirmingLogout}
                                className="btn-secondary !w-auto !rounded-xl !px-5 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Annuler
                            </button>

                            {/* Confirmation */}
                            <button
                                type="button"
                                onClick={confirmLogout}
                                disabled={isConfirmingLogout}
                                className="w-auto min-w-[150px] rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white  transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-80"
                            >
                                {isConfirmingLogout ? (
                                    <span>
                                        Déconnexion
                                        <span className="logout-dots">...</span>
                                    </span>
                                ) : (
                                    "Oui, me déconnecter"
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Animation des trois points */}
            <style>{`
                .logout-dots {
                    display: inline-block;
                    width: 18px;
                    text-align: left;
                    animation: logoutDots 2.5s steps(4, end) infinite;
                }

                @keyframes logoutDots {
                    0% {
                        opacity: 0;
                    }

                    25% {
                        opacity: 0.35;
                    }

                    50% {
                        opacity: 0.65;
                    }

                    75% {
                        opacity: 1;
                    }

                    100% {
                        opacity: 0;
                    }
                }
            `}</style>
        </>
    );
}
