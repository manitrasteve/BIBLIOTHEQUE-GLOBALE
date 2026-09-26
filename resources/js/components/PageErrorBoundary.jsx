import { Component } from "react";

const RELOAD_FLAG = "bm_chunk_reload";

// Pages chargées à la demande (React.lazy) : si un fichier de page ne peut pas être téléchargé
// (hors ligne, ou ancien fichier supprimé après une mise à jour du site), l'application ne reste
// pas sur un écran blanc. En ligne, un rechargement unique récupère la nouvelle version.
export default class PageErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        const chunkError = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(error?.message));
        try {
            // Au plus un rechargement automatique par minute : jamais de boucle si l'erreur persiste.
            const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
            if (chunkError && navigator.onLine && Date.now() - last > 60000) {
                sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
                window.location.reload();
            }
        } catch {
            // stockage indisponible : on affiche simplement le message
        }
    }

    componentDidUpdate(prevProps) {
        // Changement de page : on retente l'affichage normal.
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;

        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        return (
            <div role="alert" className="mx-auto max-w-lg px-6 py-16 text-center">
                <h1 className="font-display text-xl font-extrabold text-slate-900">
                    {offline ? "Page indisponible hors ligne" : "Cette page n'a pas pu s'afficher"}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                    {offline
                        ? "Cette page n'a pas encore été ouverte sur cet appareil. Reconnectez-vous à Internet puis réessayez."
                        : "Une nouvelle version du site est peut-être disponible."}
                </p>
                <button type="button" onClick={() => window.location.reload()} className="btn-primary mt-6">
                    Recharger
                </button>
            </div>
        );
    }
}
