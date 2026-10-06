import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Bouton « Actualiser » des espaces connectés : le layout affiche le bouton, la page affichée lui confie
// sa fonction de rechargement via usePageRefresh(load). Sans page enregistrée, le bouton est masqué.
const RefreshContext = createContext(null);

export function RefreshProvider({ children }) {
    const loaderRef = useRef(null);
    const [registered, setRegistered] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);

    const register = useCallback((loader) => {
        loaderRef.current = loader;
        setRegistered(true);
        // Le premier chargement de la page vient d'être lancé à son montage.
        setUpdatedAt(Date.now());
        return () => {
            if (loaderRef.current === loader) {
                loaderRef.current = null;
                setRegistered(false);
                setUpdatedAt(null);
            }
        };
    }, []);

    const refresh = useCallback(async () => {
        if (!loaderRef.current) return;
        setRefreshing(true);
        try {
            await loaderRef.current();
            setUpdatedAt(Date.now());
        } finally {
            setRefreshing(false);
        }
    }, []);

    const value = useMemo(
        () => ({ register, refresh, registered, refreshing, updatedAt }),
        [register, refresh, registered, refreshing, updatedAt],
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
