import { LayoutDashboard, Bell, Heart, MessageSquare, LifeBuoy, BookOpen, LibraryBig, Mail } from "lucide-react";
import ConnectedLayout from "./ConnectedLayout";

const NAV = [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/recherche", label: "Catalogue", icon: LibraryBig },
    { to: "/mes-favoris", label: "❤️ Mes favoris", icon: Heart },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/messages", label: "Messages", icon: Mail },
    { to: "/avis-suggestions", label: "💬 Avis & Suggestions", icon: MessageSquare },
    { to: "/signaler-un-probleme", label: "🆘 Signaler un problème", icon: LifeBuoy },
];

export default function UserLayout() {
    return <ConnectedLayout badge={BookOpen} eyebrow="Espace membre" title="Ma bibliothèque numérique" nav={NAV} />;
}
