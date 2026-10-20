import { useEffect, useState } from "react";
import { useRefresh } from "../context/RefreshContext";
import { SkeletonPage } from "./Skeleton";
import { PROGRESS_DONE_MS, PROGRESS_RUN_MS, useGlobalTopProgress } from "../lib/topProgress";

// Trait bleu en haut de l'écran : avance tant que `active` est vrai, puis va au bout et s'efface
// (en rouge si `failed`). Styles .refresh-progress dans app.css.
export function TopProgressBar({ active, failed = false }) {
    const [phase, setPhase] = useState("idle"); // idle | run | done

    useEffect(() => {
        if (active) {
            setPhase("run");
            return undefined;
        }
        setPhase((current) => (current === "run" ? "done" : current));
        const timer = setTimeout(() => setPhase("idle"), PROGRESS_DONE_MS);
        return () => clearTimeout(timer);
    }, [active]);

    if (phase === "idle") return null;
    return (
        <div
            className={`refresh-progress refresh-progress--${phase}${failed && phase === "done" ? " refresh-progress--failed" : ""}`}
            aria-hidden="true"
        />
    );
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Barre de progression d'un envoi (avis, signalement, dépôt…). `track(tâche)` lance la barre, attend la
 * tâche (au moins PROGRESS_RUN_MS, pour que la barre se voie), l'amène au bout puis renvoie le résultat :
 * le message de réussite s'affiche donc quand la barre a fini sa course. En cas d'erreur, la barre se
 * termine en rouge et l'erreur est relancée. Afficher `bar` n'importe où dans la page (position fixe).
 */
export function useTopProgress() {
    const [active, setActive] = useState(false);
    const [failed, setFailed] = useState(false);

    async function track(task) {
        setFailed(false);
        setActive(true);
        try {
            const [result] = await Promise.all([task(), wait(PROGRESS_RUN_MS)]);
            setActive(false);
            await wait(PROGRESS_DONE_MS);
            return result;
        } catch (error) {
            setFailed(true);
            setActive(false);
            throw error;
        }
    }

    return { bar: <TopProgressBar active={active} failed={failed} />, track };
}

// Barre partagée entre les pages (lib/topProgress.js) : montée une seule fois dans App.jsx.
export function GlobalTopProgress() {
    const { active, failed } = useGlobalTopProgress();
    return <TopProgressBar active={active} failed={failed} />;
}

// Retour visuel du bouton « Actualiser » (pas de la mise à jour automatique, qui reste silencieuse).
export function RefreshProgressBar() {
    const refreshing = useRefresh()?.refreshing;
    return <TopProgressBar active={Boolean(refreshing)} />;
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
