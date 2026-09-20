import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BookOpen,
    CheckCircle2,
    UserPlus,
    Clock3,
    Bell,
    CheckCheck,
    Inbox,
    FilePlus2,
    Pencil,
    Archive,
    Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { SkeletonList } from "../components/Skeleton";

const TYPE_ICONS = {
    document_publie: BookOpen,
    document_ajoute: FilePlus2,
    document_modifie: Pencil,
    document_archive: Archive,
    document_supprime: Trash2,
    compte_valide: CheckCircle2,
    compte_a_valider: UserPlus,
    compte_expire: Clock3,
    permissions_mises_a_jour: CheckCircle2,
};

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return new Date(dateStr).toLocaleDateString("fr-FR");
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState(null);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        load();
    }, []);

    function load() {
        api.getNotifications()
            .then((res) => setNotifications(res.data))
            .catch(() => setError("Impossible de charger vos notifications."));
    }

    async function openNotification(notification) {
        await markRead(notification);
        if (notification.related_url) navigate(notification.related_url);
    }

    async function markRead(notification) {
        if (notification.read_at) return;
        setNotifications((prev) =>
            (prev || []).map((n) =>
                n.id === notification.id
                    ? { ...n, read_at: new Date().toISOString() }
                    : n,
            ),
        );
        try {
            await api.markNotificationRead(notification.id);
        } catch {
            load(); // resynchronise en cas d'échec
        }
    }

    async function markUnread(notification) {
        setNotifications((prev)=>(prev||[]).map(n=>n.id===notification.id?{...n,read_at:null}:n));
        try { await api.markNotificationUnread(notification.id); } catch { load(); }
    }

    async function markAllRead() {
        setNotifications((prev) =>
            (prev || []).map((n) => ({
                ...n,
                read_at: n.read_at || new Date().toISOString(),
            })),
        );
        try {
            await api.markAllNotificationsRead();
        } catch {
            load();
        }
    }

    const hasUnread = notifications?.some((n) => !n.read_at);

    return (
        <div className="w-full">
            <div className="flex items-baseline justify-between mb-8">
                <h1 className="flex items-center gap-2 font-display text-3xl  text-brass hover:text-brass-deep">
                    <Bell
                        className="h-6 w-6  text-brass hover:text-brass-deep"
                        strokeWidth={1.75}
                    />
                    Notifications
                </h1>
                {hasUnread && (
                    <button
                        onClick={markAllRead}
                        className="flex items-center gap-1.5 text-sm text-brass hover:text-brass-deep"
                    >
                        <CheckCheck className="h-4 w-4" strokeWidth={1.75} />
                        Tout marquer comme lu
                    </button>
                )}
            </div>

            {error && <p className="text-red-700">{error}</p>}

            {notifications === null && <SkeletonList count={5} />}

            {notifications?.length === 0 && (
                <div className="rounded-xl border border-dashed border-line p-10 text-center">
                    <Inbox
                        className="h-6 w-6 mx-auto text-ink-soft/50 mb-2"
                        strokeWidth={1.5}
                    />
                    <p className="text-ink-soft text-sm">
                        Aucune notification pour le moment.
                    </p>
                </div>
            )}

            {notifications?.length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line bg-paper overflow-hidden">
                    {notifications.map((n) => {
                        const Icon = TYPE_ICONS[n.type] || Bell;
                        return (
                            <li
                                key={n.id}
                                onClick={() => openNotification(n)}
                                className={`p-4 flex gap-3 cursor-pointer transition-colors ${
                                    n.read_at ? "bg-paper" : "bg-brass/5"
                                } hover:bg-paper-dim/50`}
                            >
                                <span className="flex-shrink-0 h-8 w-8 rounded-full bg-paper-dim flex items-center justify-center text-ink-soft mt-0.5">
                                    <Icon
                                        className="h-4 w-4"
                                        strokeWidth={1.75}
                                    />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={`text-sm ${n.read_at ? "text-ink-soft" : "text-ink font-medium"}`}
                                    >
                                        {n.title}
                                    </p>
                                    {n.message && (
                                        <p className="text-xs text-ink-soft mt-0.5">
                                            {n.message}
                                        </p>
                                    )}
                                    <p className="text-[11px] text-ink-soft/60 mt-1">
                                        {timeAgo(n.created_at)}
                                    </p>
                                </div>
                                <div className="mt-1 flex shrink-0 items-center gap-2" onClick={(e)=>e.stopPropagation()}>
                                    {n.read_at ? <button type="button" onClick={()=>markUnread(n)} className="text-[11px] font-semibold text-brass hover:text-brass-deep">Marquer comme non lu</button> : <span className="h-2 w-2 rounded-full bg-brass" />}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
