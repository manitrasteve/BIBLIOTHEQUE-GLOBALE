import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "../lib/api";

export default function NotificationBell({ isAdmin = false, isLibrarian = false }) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let mounted = true;

        function refresh() {
            api.getUnreadNotificationCount()
                .then((res) => mounted && setCount(res.count))
                .catch(() => {});
        }

        // Onglet caché : aucune requête ; au retour sur l'onglet, mise à jour immédiate.
        const onVisible = () => document.visibilityState === "visible" && refresh();

        refresh();
        const interval = setInterval(onVisible, 30000);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            mounted = false;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

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
