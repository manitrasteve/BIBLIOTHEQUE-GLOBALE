import { Activity, FileText, BarChart3, Building2, UserCheck, History, ShieldCheck, Heart, MessageSquare, LifeBuoy, Mail, Users, Trash2, KeyRound, Sparkles } from "lucide-react";
import ConnectedLayout from "./ConnectedLayout";

// Ordre logique (même logique que l'espace Service Numérique) : pilotage → contenu → comptes → suivi des
// usagers → communication → traçabilité, la Corbeille en dernier.
const NAV = [
    // Pilotage
    { to: "/administrateur/statistiques", label: "Statistiques", icon: BarChart3 },
    { to: "/administrateur/assistant", label: "Assistant IA", icon: Sparkles },
    // Contenu
    { to: "/administrateur/documents", label: "Documents", icon: FileText, badge: "drafts" },
    { to: "/administrateur/bibliotheques", label: "Bibliothèques", icon: Building2 },
    // Comptes
    { to: "/administrateur/comptes", label: "Comptes à valider", icon: UserCheck, badge: "account_requests" },
    { to: "/administrateur/utilisateurs", label: "Utilisateurs", icon: Users },
    { to: "/administrateur/bibliothecaires", label: "Bibliothécaires", icon: Users },
    { to: "/administrateur/permissions", label: "Gestion des permissions", icon: KeyRound },
    // Suivi des usagers
    { to: "/administrateur/popularite", label: "Popularité", icon: Heart },
    { to: "/administrateur/avis", label: "Avis des utilisateurs", icon: MessageSquare, badge: "feedbacks" },
    { to: "/administrateur/signalements", label: "Signalements", icon: LifeBuoy, badge: "reports" },
    // Communication
    { to: "/administrateur/messages", label: "Messages", icon: Mail, badge: "staff_messages" },
    // Traçabilité
    { to: "/administrateur/activites", label: "Mes activités", icon: Activity },
    { to: "/administrateur/historique", label: "Historique global", icon: History },
    { to: "/administrateur/corbeille", label: "Corbeille", icon: Trash2, badge: "trash" },
];

export default function AdminLayout() {
    return <ConnectedLayout badge={ShieldCheck} eyebrow="Espace administrateur" title="Supervision de la plateforme" nav={NAV} />;
}
