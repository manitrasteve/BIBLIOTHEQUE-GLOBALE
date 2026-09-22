import {
    LayoutDashboard,
    Bell,
    Heart,
    MessageSquare,
    LifeBuoy,
    BookOpen,
    LibraryBig,
    Mail,
    BookMarked,
    Activity,
    Microscope,
    History,
    Radar,
} from "lucide-react";
import ConnectedLayout from "./ConnectedLayout";
import { useAuth } from "../context/AuthContext";

const ITEM = {
    dashboard: { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
    catalogue: { to: "/recherche", label: "Catalogue", icon: LibraryBig },
    researchSpace: { to: "/espace-recherche", label: "Espace recherche", icon: Microscope },
    readings: { to: "/mes-lectures", label: "Mes lectures", icon: BookMarked },
    activities: { to: "/mes-activites", label: "Mes activités", icon: Activity },
    searches: { to: "/mes-recherches", label: "Mes recherches", icon: History },
    watch: { to: "/veille-scientifique", label: "Veille scientifique", icon: Radar },
    favorites: { to: "/mes-favoris", label: "❤️ Mes favoris", icon: Heart },
    notifications: { to: "/notifications", label: "Notifications", icon: Bell },
    messages: { to: "/messages", label: "Messages", icon: Mail },
    feedback: { to: "/avis-suggestions", label: "💬 Avis & Suggestions", icon: MessageSquare },
    report: { to: "/signaler-un-probleme", label: "🆘 Signaler un problème", icon: LifeBuoy },
};

const COMMON_END = ["favorites", "notifications", "messages", "feedback", "report"];

// Ordre des modules par rôle. Les autres rôles gardent la navigation de base.
const NAV_BY_ROLE = {
    etudiant: ["dashboard", "catalogue", "readings", "activities", ...COMMON_END],
    enseignant: ["dashboard", "catalogue", "readings", "activities", ...COMMON_END],
    chercheur: [
        "dashboard",
        "catalogue",
        "researchSpace",
        "readings",
        "activities",
        "searches",
        "watch",
        ...COMMON_END,
    ],
    // Administrateur / Service Numérique consultant « Mon profil » (espace membre) :
    // même module « Mes lectures » que sur le compte Enseignant.
    administrateur: ["dashboard", "catalogue", "readings", ...COMMON_END],
    bibliothecaire: ["dashboard", "catalogue", "readings", ...COMMON_END],
};

const DEFAULT_NAV = ["dashboard", "catalogue", ...COMMON_END];

export default function UserLayout() {
    const { user } = useAuth();
    const nav = (NAV_BY_ROLE[user?.role] || DEFAULT_NAV).map((key) => ITEM[key]);

    return <ConnectedLayout badge={BookOpen} eyebrow="Espace membre" title="Ma bibliothèque numérique" nav={nav} />;
}
