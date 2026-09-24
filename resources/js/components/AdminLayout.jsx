import { Activity, FileText, BarChart3, Building2, UserCheck, History, ShieldCheck, Heart, MessageSquare, LifeBuoy, Mail, Users, Trash2, KeyRound, Sparkles } from "lucide-react";
import ConnectedLayout from "./ConnectedLayout";

const NAV = [
    { to: "/administrateur/statistiques", label: "Statistiques", icon: BarChart3 },
    { to: "/administrateur/assistant", label: "Assistant IA", icon: Sparkles },
    { to: "/administrateur/documents", label: "Documents", icon: FileText },
    { to: "/administrateur/bibliotheques", label: "Bibliothèques", icon: Building2 },
    { to: "/administrateur/bibliothecaires", label: "Bibliothécaires", icon: Users },
    { to: "/administrateur/permissions", label: "Gestion des permissions", icon: KeyRound },
    { to: "/administrateur/utilisateurs", label: "Utilisateurs", icon: Users },
    { to: "/administrateur/corbeille", label: "Corbeille", icon: Trash2 },
    { to: "/administrateur/comptes", label: "Comptes à valider", icon: UserCheck },
    { to: "/administrateur/popularite", label: "Popularité", icon: Heart },
    { to: "/administrateur/avis", label: "Avis des utilisateurs", icon: MessageSquare },
    { to: "/administrateur/signalements", label: "Signalements", icon: LifeBuoy },
    { to: "/administrateur/messages", label: "Messages", icon: Mail },
    { to: "/administrateur/activites", label: "Mes activités", icon: Activity },
    { to: "/administrateur/historique", label: "Historique global", icon: History },
];

export default function AdminLayout() {
    return <ConnectedLayout badge={ShieldCheck} eyebrow="Espace administrateur" title="Supervision de la plateforme" nav={NAV} />;
}
