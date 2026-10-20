import { useEffect, useState } from "react";
import { useRefresh } from "../context/RefreshContext";
import { SkeletonPage } from "./Skeleton";

// Retour visuel du bouton « Actualiser » (pas de la mise à jour automatique, qui reste silencieuse).

// Trait bleu en haut de l'écran : avance pendant le chargement, se termine puis s'efface (styles .refresh-progress).
export function RefreshProgressBar() {
    const refreshing = useRefresh()?.refreshing;
    const [phase, setPhase] = useState("idle"); // idle | run | done

    useEffect(() => {
        if (refreshing) {
            setPhase("run");
            return undefined;
        }
        setPhase((current) => (current === "run" ? "done" : current));
        const timer = setTimeout(() => setPhase("idle"), 450);
        return () => clearTimeout(timer);
    }, [refreshing]);

    if (phase === "idle") return null;
    return <div className={`refresh-progress refresh-progress--${phase}`} aria-hidden="true" />;
}

// Contenu de la page remplacé par un squelette pendant l'actualisation. La page reste montée (masquée)
// pour garder ses filtres et recevoir les nouvelles données.
export function RefreshContent({ children }) {
    const refreshing = useRefresh()?.refreshing;

    return (
        <>
            {refreshing && <SkeletonPage />}
            <div hidden={refreshing} className="contents">
                {children}
            </div>
        </>
    );
}
