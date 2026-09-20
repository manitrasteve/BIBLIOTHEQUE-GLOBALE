import { useEffect } from "react";

// Bloque le défilement de la page derrière le tiroir de navigation ouvert (mobile / tablette).
// Le tiroir lui-même reste défilable ; sur grand écran (sidebar fixe) rien n'est bloqué.
export function useDrawerScrollLock(active) {
    useEffect(() => {
        if (!active || !window.matchMedia("(max-width: 1023.98px)").matches) {
            return undefined;
        }

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previous;
        };
    }, [active]);
}
