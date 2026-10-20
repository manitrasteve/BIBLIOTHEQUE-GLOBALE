import { useSyncExternalStore } from "react";

// Durée de la course de la barre jusqu'à 85 % (animation refresh-progress-run) et de sa fin (refresh-progress-done).
export const PROGRESS_RUN_MS = 1000;
export const PROGRESS_DONE_MS = 450;
// Sécurité : une barre lancée mais jamais terminée (page quittée, redirection) s'arrête seule.
const SAFETY_MS = 15000;

/**
 * Barre de progression qui survit à un changement de page (ex. « Reprendre ma lecture » : lancée sur
 * le tableau de bord, terminée quand la fiche du document est chargée). Affichée par
 * <GlobalTopProgress /> (components/RefreshView.jsx), monté une seule fois dans App.jsx.
 */
let state = { active: false, failed: false };
const listeners = new Set();
let startedAt = 0;
let run = 0;
let safetyTimer = null;

function setState(next) {
    state = next;
    listeners.forEach((listener) => listener());
}

// Utilisable directement en onClick d'un lien : rien ne se passe si le lien s'ouvre dans un autre onglet.
export function startTopProgress(event) {
    if (event && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    run++;
    startedAt = Date.now();
    clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => finishTopProgress(), SAFETY_MS);
    setState({ active: true, failed: false });
}

// Termine la barre (en rouge si `failed`), après au moins PROGRESS_RUN_MS de course. Sans effet si aucune barre ne tourne.
export function finishTopProgress(failed = false) {
    if (!state.active) return;
    const current = run;
    clearTimeout(safetyTimer);
    setTimeout(() => {
        if (current === run && state.active) setState({ active: false, failed });
    }, Math.max(0, PROGRESS_RUN_MS - (Date.now() - startedAt)));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Entoure une action envoyée au serveur (créer, valider, restaurer…) : la barre court pendant l'action
 * (au moins PROGRESS_RUN_MS), va au bout, puis le résultat est rendu ; la suite (message, rechargement)
 * s'affiche donc quand la barre a fini. En cas d'erreur, la barre finit en rouge et l'erreur est relancée.
 */
export async function trackTopProgress(task) {
    startTopProgress();
    try {
        const [result] = await Promise.all([task(), wait(PROGRESS_RUN_MS)]);
        finishTopProgress();
        await wait(PROGRESS_DONE_MS);
        return result;
    } catch (error) {
        finishTopProgress(true);
        throw error;
    }
}

export function useGlobalTopProgress() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => state,
    );
}
