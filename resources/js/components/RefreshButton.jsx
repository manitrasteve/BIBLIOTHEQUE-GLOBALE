import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRefresh } from "../context/RefreshContext";
import { useToast } from "./Toast";

function sinceLabel(updatedAt, now) {
    const minutes = Math.floor((now - updatedAt) / 60000);
    if (minutes < 1) return "Mis à jour à l’instant";
    if (minutes < 60) return `Mis à jour il y a ${minutes} min`;
    return `Mis à jour à ${new Date(updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Bouton « Actualiser » de l'en-tête des espaces connectés (voir RefreshContext).
export default function RefreshButton() {
    const ctx = useRefresh();
    const toast = useToast();
    const [now, setNow] = useState(() => Date.now());

    // Fait avancer « il y a X min » sans action de l'utilisateur.
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    if (!ctx?.registered) return null;
    const { refresh, refreshing, updatedAt } = ctx;

    async function run() {
        try {
            await refresh();
            setNow(Date.now());
            toast("Données actualisées");
        } catch {
            toast("L’actualisation a échoué. Réessayez.");
        }
    }

    return (
        <div className="flex shrink-0 items-center gap-3">
            {updatedAt && (
                <span className="hidden text-xs text-slate-500 sm:inline" aria-live="polite">
                    {refreshing ? "Actualisation…" : sinceLabel(updatedAt, Math.max(now, updatedAt))}
                </span>
            )}
            <button
                type="button"
                onClick={run}
                disabled={refreshing}
                className="btn-secondary disabled:opacity-60"
                title="Recharger les données de cette page"
            >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                <span className="hidden sm:inline">Actualiser</span>
                <span className="sr-only sm:hidden">Actualiser</span>
            </button>
        </div>
    );
}
