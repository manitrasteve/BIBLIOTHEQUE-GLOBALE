import { useEffect, useState } from "react";

// Minuscules + suppression des accents, sans toucher aux données d'origine.
export function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

// Recherche "contient" : vide => tout correspond (état initial).
export function matchesSearch(haystack, term) {
    const needle = normalizeText(term).trim();
    return !needle || normalizeText(haystack).includes(needle);
}

// Valeur retardée (recherche serveur). Une valeur vide est appliquée
// immédiatement pour revenir sans attente à l'état initial.
export function useDebouncedValue(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        if (value === "") {
            setDebounced("");
            return undefined;
        }
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}
