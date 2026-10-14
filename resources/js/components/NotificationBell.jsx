import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "./Toast";

// Clé de mémorisation (par visiteur) de la dernière notification déjà signalée : évite de
// re-notifier la même au rechargement de la page.
const SEEN_KEY = "bm_last_notif_id";

function readSeen() {
    try {
        return Number(localStorage.getItem(SEEN_KEY)) || 0;
    } catch {
        return 0;
    }
}

function writeSeen(id) {
    try {
        localStorage.setItem(SEEN_KEY, String(id));
    } catch {
        // stockage indisponible (navigation privée…) : on continue sans mémoriser
    }
}

export default function NotificationBell({ isAdmin = false, isLibrarian = false }) {
    const [count, setCount] = useState(0);
    const toast = useToast();
    const seenRef = useRef(null); // dernier id connu ; null tant qu'on n'a pas fait le premier relevé

    useEffect(() => {
        let mounted = true;

        function refresh() {
            api
                .getRecentNotifications()
                .then((res) => {
                    if (!mounted) return;
                    setCount(res.count || 0);

                    const latestId = res.latest?.id || 0;

                    // Premier relevé : on initialise la référence sans rien signaler (pas de toast au chargement).
                    if (seenRef.current === null) {
                        seenRef.current = Math.max(latestId, readSeen());
                        return;
                    }

                    // Une notification plus récente que tout ce qu'on a déjà vu : toast + mémorisation.
                    if (latestId > seenRef.current) {
                        seenRef.current = latestId;
                        writeSeen(latestId);
                        if (res.latest?.title) {
                            toast(`🔔 ${res.latest.title}`);
                        }
                    }
                })
                .catch(() => {});
        }

        // Onglet caché : aucune requête ; au retour sur l'onglet, mise à jour immédiate.
        const onVisible = () => document.visibilityState === "visible" && refresh();

        refresh();
        const interval = setInterval(onVisible, 20000);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            mounted = false;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [toast]);

    return (
        <Link
            to={isAdmin ? "/administrateur/notifications" : isLibrarian ? "/bibliothecaire/notifications" : "/notifications"}
            className="relative text-ink-soft hover:text-ink transition-colors"
            aria-label="Notifications"
        >
            <Bell className="h-5 w-5" strokeWidth={1.75} />
            {count > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-paper text-[10px] font-semibold flex items-center justify-center">
                    {count > 9 ? "9+" : count}
                </span>
            )}
        </Link>
    );
}
