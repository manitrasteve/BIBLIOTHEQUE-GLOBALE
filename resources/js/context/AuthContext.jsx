import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";

const AuthContext = createContext(null);

// Dernier profil connu (hors ligne) : uniquement ce qu'il faut pour afficher l'interface.
const USER_CACHE_KEY = "bm_user_cache";
const USER_CACHE_FIELDS = ["id", "uuid", "name", "role", "permissions", "photo_url", "library", "library_id", "is_active"];

function rememberUser(user) {
    try {
        const slim = Object.fromEntries(USER_CACHE_FIELDS.filter((k) => k in (user || {})).map((k) => [k, user[k]]));
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(slim));
    } catch {
        // stockage indisponible : pas de mode hors ligne, rien d'autre ne change
    }
}

function readRememberedUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_CACHE_KEY)) || null;
    } catch {
        return null;
    }
}

export function forgetUser() {
    try {
        localStorage.removeItem(USER_CACHE_KEY);
        localStorage.removeItem("bm_offline_favorites");
    } catch {
        // rien à effacer
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("bm_token");

        if (!token) {
            setLoading(false);
            return;
        }

        api.me()
            .then((me) => {
                setUser(me);
                rememberUser(me);
            })
            .catch((error) => {
                // Jeton refusé (expiré, révoqué, compte désactivé) : vraie déconnexion.
                if (error?.status === 401 || error?.status === 403) {
                    localStorage.removeItem("bm_token");
                    forgetUser();
                    sessionMemory.clear();
                    setUser(null);
                    return;
                }
                // Hors ligne ou serveur momentanément indisponible : la session est conservée avec le
                // dernier profil connu, pour l'affichage seulement (le serveur revérifie tout à chaque requête).
                setUser(readRememberedUser());
            })
            .finally(() => setLoading(false));
    }, []);

    // Les permissions peuvent être modifiées par l'administrateur pendant la session :
    // on relit le profil quand l'onglet redevient actif (sans déconnecter en cas d'échec).
    useEffect(() => {
        function refreshUser() {
            if (document.visibilityState !== "visible") return;
            if (!localStorage.getItem("bm_token")) return;

            api.me()
                .then((me) => {
                    setUser(me);
                    rememberUser(me);
                })
                .catch(() => {});
        }

        document.addEventListener("visibilitychange", refreshUser);
        window.addEventListener("focus", refreshUser);

        return () => {
            document.removeEventListener("visibilitychange", refreshUser);
            window.removeEventListener("focus", refreshUser);
        };
    }, []);

    async function login(email, password) {
        const { user, token } = await api.login(email, password);

        localStorage.setItem("bm_token", token);
        sessionMemory.clear();
        forgetUser(); // un autre compte a pu utiliser cet appareil : pas de données hors ligne héritées
        setUser(user);
        rememberUser(user);

        return user;
    }

    async function logout() {
        try {
            await api.logout();
        } finally {
            localStorage.removeItem("bm_token");
            forgetUser();
            sessionMemory.clear();
            setUser(null);
            setIsLoggingOut(false);
        }
    }

    function openLogoutModal() {
        setIsLoggingOut(true);
    }

    function cancelLogout() {
        setIsLoggingOut(false);
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                setUser,
                loading,
                login,
                logout,
                isLoggingOut,
                openLogoutModal,
                cancelLogout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);

    if (!ctx) {
        throw new Error("useAuth doit être utilisé dans un <AuthProvider>.");
    }

    return ctx;
}
