import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";

const AuthContext = createContext(null);

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
            .then(setUser)
            .catch(() => {
                localStorage.removeItem("bm_token");
                sessionMemory.clear();
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    // Les permissions peuvent être modifiées par l'administrateur pendant la session :
    // on relit le profil quand l'onglet redevient actif (sans déconnecter en cas d'échec).
    useEffect(() => {
        function refreshUser() {
            if (document.visibilityState !== "visible") return;
            if (!localStorage.getItem("bm_token")) return;

            api.me().then(setUser).catch(() => {});
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
        setUser(user);

        return user;
    }

    async function logout() {
        try {
            await api.logout();
        } finally {
            localStorage.removeItem("bm_token");
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
