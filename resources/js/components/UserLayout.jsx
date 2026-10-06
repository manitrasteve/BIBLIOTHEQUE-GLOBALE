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
    Radar,
    BookOpenCheck,
    UploadCloud,
    Sparkles,
    School,
} from "lucide-react";
import ConnectedLayout from "./ConnectedLayout";
import { useAuth } from "../context/AuthContext";

const ITEM = {
    dashboard: { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
    catalogue: { to: "/recherche", label: "Catalogue", icon: LibraryBig },
    researchSpace: { to: "/espace-recherche", label: "Espace recherche", icon: Microscope },
    readings: { to: "/mes-lectures", label: "Mes lectures", icon: BookMarked },
    activities: { to: "/mes-activites", label: "Mes activités", icon: Activity },
    watch: { to: "/veille-scientifique", label: "Veille scientifique", icon: Radar },
    favorites: { to: "/mes-favoris", label: "Mes favoris", icon: Heart },
    notifications: { to: "/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
    messages: { to: "/messages", label: "Messages", icon: Mail, badge: "messages" },
    feedback: { to: "/avis-suggestions", label: "Avis & Suggestions", icon: MessageSquare },
    report: { to: "/signaler-un-probleme", label: "Signaler un problème", icon: LifeBuoy },
    // Enseignant
    classes: { to: "/mes-classes", label: "Mes classes", icon: School },
    courses: { to: "/mes-cours", label: "Mes cours", icon: BookOpenCheck },
    submissions: { to: "/mes-depots", label: "Mes dépôts", icon: UploadCloud },
    questions: { to: "/questions-revision", label: "Questions de révision", icon: Sparkles },
};

// Ordre logique : accueil → découvrir → ma bibliothèque (lectures, favoris, activités) → communication →
// aide (avis, signalement) en dernier.
const LIBRARY = ["readings", "favorites", "activities"];
const COMMON_END = ["notifications", "messages", "feedback", "report"];

// Ordre des modules par rôle. Les autres rôles gardent la navigation de base.
const NAV_BY_ROLE = {
    etudiant: ["dashboard", "catalogue", ...LIBRARY, ...COMMON_END],
    // Enseignant : ses outils de cours juste après le catalogue.
    enseignant: ["dashboard", "catalogue", "classes", "courses", "submissions", "questions", ...LIBRARY, ...COMMON_END],
    // Chercheur : ses outils de recherche juste après le catalogue.
    chercheur: ["dashboard", "catalogue", "researchSpace", "watch", ...LIBRARY, ...COMMON_END],
    // Administrateur / Service Numérique consultant « Mon profil » (espace membre) :
    // même module « Mes lectures » que sur le compte Enseignant, sans
    // « Avis & Suggestions » ni « Signaler un problème » (ce sont eux qui les traitent).
    administrateur: ["dashboard", "catalogue", "readings", "favorites", "notifications", "messages"],
    bibliothecaire: ["dashboard", "catalogue", "readings", "favorites", "notifications", "messages"],
};

const DEFAULT_NAV = ["dashboard", "catalogue", "favorites", ...COMMON_END];

export default function UserLayout() {
    const { user } = useAuth();
    const nav = (NAV_BY_ROLE[user?.role] || DEFAULT_NAV).map((key) => ITEM[key]);

    return <ConnectedLayout badge={BookOpen} eyebrow="Espace membre" title="Ma bibliothèque numérique" nav={nav} />;
}
