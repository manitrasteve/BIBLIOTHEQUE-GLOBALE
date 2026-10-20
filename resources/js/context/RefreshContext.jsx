import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Actualisation des espaces connectés : la page affichée confie sa fonction de rechargement via
// usePageRefresh(load). Elle est appelée :
//  - automatiquement (mise à jour en direct, sans recharger la page) toutes les AUTO_REFRESH_MS quand l'onglet
//    est visible, et dès le retour sur l'onglet ;
//  - à la demande, par le bouton « Actualiser » du layout (masqué sans page enregistrée).
const RefreshContext = createContext(null);

const AUTO_REFRESH_MS = 15000;
// Retour sur l'onglet : pas de nouvelle requête si la dernière mise à jour est toute récente.
const MIN_GAP_ON_FOCUS_MS = 5000;
// Actualisation manuelle : le squelette et la barre de progression restent visibles au moins ce temps,
// pour que le rechargement se voie même quand la réponse est instantanée.
const MIN_MANUAL_REFRESH_MS = 1000;

// L'utilisateur est en train de saisir ou de lire quelque chose qu'un rechargement pourrait perturber.
function userIsBusy() {
    const active = document.activeElement;
    const editing =
        active &&
        (active.isContentEditable ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT" ||
            // Une barre de recherche ne contient pas de saisie à préserver : elle n'empêche pas la mise à jour.
            (active.tagName === "INPUT" && active.type !== "search"));
    const dialogOpen = Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'));
    const selectingText = Boolean(window.getSelection?.()?.toString());

    return editing || dialogOpen || selectingText;
}

export function RefreshProvider({ children }) {
    const loaderRef = useRef(null);
    const busyRef = useRef(false); // une actualisation (manuelle ou automatique) est en cours
    const pausesRef = useRef(new Set()); // pages ayant des modifications non enregistrées
    const lastUpdateRef = useRef(0);
    const [registered, setRegistered] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);
    // Nombre d'actualisations réussies : permet à d'autres éléments (badges du menu) de se recharger aussi.
    const [refreshCount, setRefreshCount] = useState(0);

    const markUpdated = useCallback(() => {
        const now = Date.now();
        lastUpdateRef.current = now;
        setUpdatedAt(now);
    }, []);

    const register = useCallback((loader) => {
        loaderRef.current = loader;
        setRegistered(true);
        // Le premier chargement de la page vient d'être lancé à son montage.
        markUpdated();
        return () => {
            if (loaderRef.current === loader) {
                loaderRef.current = null;
                setRegistered(false);
                setUpdatedAt(null);
            }
        };
    }, [markUpdated]);

    // Bouton « Actualiser » : indicateur de chargement, et l'échec remonte au bouton.
    const refresh = useCallback(async () => {
        if (!loaderRef.current) return;
        busyRef.current = true;
        setRefreshing(true);
        try {
            await Promise.all([
                loaderRef.current(),
                new Promise((resolve) => setTimeout(resolve, MIN_MANUAL_REFRESH_MS)),
            ]);
            markUpdated();
            setRefreshCount((n) => n + 1);
        } finally {
            busyRef.current = false;
            setRefreshing(false);
        }
    }, [markUpdated]);

    // Mise à jour automatique : silencieuse (pas d'indicateur), sans erreur affichée (nouvel essai au tour suivant).
    const autoRefresh = useCallback(async () => {
        if (!loaderRef.current || busyRef.current || pausesRef.current.size > 0) return;
        if (document.visibilityState !== "visible" || userIsBusy()) return;

        busyRef.current = true;
        try {
            await loaderRef.current();
            markUpdated();
            setRefreshCount((n) => n + 1);
        } catch {
            // réseau momentanément indisponible, session expirée… : rien à afficher
        } finally {
            busyRef.current = false;
        }
    }, [markUpdated]);

    useEffect(() => {
        const interval = setInterval(autoRefresh, AUTO_REFRESH_MS);
        const onReturn = () => {
            if (Date.now() - lastUpdateRef.current >= MIN_GAP_ON_FOCUS_MS) autoRefresh();
        };
        const onVisibility = () => document.visibilityState === "visible" && onReturn();

        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onReturn);
        window.addEventListener("online", onReturn);
        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", onReturn);
            window.removeEventListener("online", onReturn);
        };
    }, [autoRefresh]);

    const pause = useCallback((token) => {
        pausesRef.current.add(token);
        return () => pausesRef.current.delete(token);
    }, []);

    const value = useMemo(
        () => ({ register, refresh, pause, registered, refreshing, updatedAt, refreshCount, autoRefreshMs: AUTO_REFRESH_MS }),
        [register, refresh, pause, registered, refreshing, updatedAt, refreshCount],
    );

    return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
    return useContext(RefreshContext);
}

// À appeler dans une page : `load` doit recharger les données sans vider l'écran (la page garde ses filtres,
// sa page courante…) et renvoyer une promesse rejetée en cas d'échec. La dernière version de `load` est
// toujours utilisée, inutile de la mémoriser.
export function usePageRefresh(load) {
    const ctx = useContext(RefreshContext);
    const loadRef = useRef(load);
    loadRef.current = load;
    const register = ctx?.register;

    useEffect(() => {
        if (!register) return undefined;
        return register(() => loadRef.current());
    }, [register]);
}

// Suspend la mise à jour automatique tant que `paused` est vrai (ex. : modifications non enregistrées
// qu'un rechargement remplacerait). Le bouton « Actualiser » reste utilisable.
export function usePauseAutoRefresh(paused) {
    const pause = useContext(RefreshContext)?.pause;

    useEffect(() => {
        if (!paused || !pause) return undefined;
        return pause(Symbol("pause"));
    }, [paused, pause]);
}
