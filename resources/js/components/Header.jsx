import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    UserPlus,
    UserCircle,
    LayoutDashboard,
    ShieldCheck,
    LogOut,
    LogIn,
    LibraryBig,
    Menu,
    X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
    const { user, logout, isLoggingOut, openLogoutModal, cancelLogout } =
        useAuth();

    const navigate = useNavigate();
    const location = useLocation();

    const isHome = location.pathname === "/";

    // Pages publiques qui utilisent le Header public
    const isPublicPage =
        location.pathname === "/" ||
        location.pathname === "/creer-un-compte" ||
        location.pathname === "/connexion";

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
                className={`sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl shadow-sm ${
                    isLoggingOut ? "pointer-events-none" : ""
                }`}
            >
                <div className="mx-auto w-full px-4 sm:px-8 xl:px-10 py-3 flex items-center justify-between gap-4">
                    {/* ================= LOGO ================= */}
                    <Link to="/" className="flex items-center gap-3 min-w-0">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                            <LibraryBig className="h-5 w-5" />
                        </span>

                        <span className="min-w-0">
                            <span className="block truncate font-display text-[15px] sm:text-base font-extrabold tracking-tight text-slate-900">
                                Bibliothèque Numérique
                            </span>

                            <span className="hidden sm:block text-[10px] font-bold uppercase tracking-[.16em] text-indigo-600">
                                Université de Mahajanga
                            </span>
                        </span>
                    </Link>

                    {/* ================= NAVIGATION ================= */}
                    <nav className="flex items-center gap-2 sm:gap-3 text-sm">
                        {/* =====================================================
                            PAGES PUBLIQUES + DÉCONNECTÉ

                            /
                            /creer-un-compte
                            /connexion

                            Afficher :
                            Catalogue + S'inscrire + 🌙 + Connexion

                            AUCUN ☰
                        ====================================================== */}
                        {isPublicPage && !user ? (
                            <>
                                {/* Catalogue */}
                                <Link
                                    to="/"
                                    className="inline-flex rounded-xl px-2 py-2 sm:px-3 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                >
                                    Catalogue
                                </Link>

                                {/* S'inscrire */}
                                <Link
                                    to="/creer-un-compte"
                                    className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 sm:px-3 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                    <UserPlus className="h-4 w-4" />
                                    S’inscrire
                                </Link>

                                {/* Lune */}
                                <ThemeToggle />

                                {/* Connexion */}
                                <Link
                                    to="/connexion"
                                    className="btn-primary !rounded-xl !px-4 !py-2.5"
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
                                        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                            {/* Catalogue */}
                                            <Link
                                                to="/"
                                                onClick={() =>
                                                    setMenuOpen(false)
                                                }
                                                className="flex items-center rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                            >
                                                Catalogue
                                            </Link>

                                            {/* Gestion */}
                                            {[
                                                "bibliothecaire",
                                                "administrateur",
                                            ].includes(user.role) && (
                                                <Link
                                                    to="/bibliothecaire"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
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
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                    Administration
                                                </Link>
                                            )}

                                            {/* Bonjour */}
                                            <Link
                                                to="/tableau-de-bord"
                                                onClick={() =>
                                                    setMenuOpen(false)
                                                }
                                                className="flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                <UserCircle className="h-4 w-4" />
                                                Mon espace
                                            </Link>

                                            <div className="my-1 border-t border-slate-100" />

                                            {/* Déconnexion */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    openLogoutModal();
                                                }}
                                                className="flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-left font-semibold text-rose-600 hover:bg-rose-50"
                                            >
                                                <LogOut className="h-4 w-4" />
                                                Déconnexion
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* =====================================================
                               PAGES INTERNES

                               Connecté   → 🌙 + 🔔 + ☰
                               Déconnecté → 🌙 + ☰
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
                                        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                                            {/* Catalogue */}
                                            <Link
                                                to="/"
                                                onClick={() =>
                                                    setMenuOpen(false)
                                                }
                                                className="flex items-center rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                            >
                                                Catalogue
                                            </Link>

                                            {/* S'inscrire */}
                                            {!user && (
                                                <Link
                                                    to="/creer-un-compte"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                                                >
                                                    <UserPlus className="h-4 w-4" />
                                                    S’inscrire
                                                </Link>
                                            )}

                                            {/* Gestion */}
                                            {user &&
                                                [
                                                    "bibliothecaire",
                                                    "administrateur",
                                                ].includes(user.role) && (
                                                    <Link
                                                        to="/bibliothecaire"
                                                        onClick={() =>
                                                            setMenuOpen(false)
                                                        }
                                                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
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
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                    Administration
                                                </Link>
                                            )}

                                            {/* Bonjour */}
                                            {user && (
                                                <Link
                                                    to="/tableau-de-bord"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100"
                                                >
                                                    <UserCircle className="h-4 w-4" />
                                                    Mon espace
                                                </Link>
                                            )}

                                            <div className="my-1 border-t border-slate-100" />

                                            {/* Déconnexion / Connexion */}
                                            {user ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setMenuOpen(false);
                                                        openLogoutModal();
                                                    }}
                                                    className="flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-left font-semibold text-rose-600 hover:bg-rose-50"
                                                >
                                                    <LogOut className="h-4 w-4" />
                                                    Déconnexion
                                                </button>
                                            ) : (
                                                <Link
                                                    to="/connexion"
                                                    onClick={() =>
                                                        setMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-indigo-600 hover:bg-indigo-50"
                                                >
                                                    <LogIn className="h-4 w-4" />
                                                    Connexion
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            {/* =====================================================
                MODAL DE CONFIRMATION DE DÉCONNEXION
            ====================================================== */}

            {isLoggingOut && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="logout-title"
                >
                    <div
                        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* Icône */}
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
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
                                className="w-auto min-w-[150px] rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-80"
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
                </div>
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
