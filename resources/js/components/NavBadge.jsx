import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useRefresh } from "../context/RefreshContext";

// Couleur du badge selon la rubrique : rouge = action requise, ambre = nouveauté à lire, gris = simple total.
const TONES = {
    account_requests: "urgent",
    submissions: "urgent",
    class_requests: "urgent",
    reports: "urgent",
    feedbacks: "new",
    recommended: "new",
    messages: "new",
    staff_messages: "new",
    notifications: "new",
    drafts: "neutral",
    trash: "neutral",
};

const TONE_CLASSES = {
    urgent: "bg-red-600 text-white",
    new: "bg-amber-600 text-white",
    neutral: "bg-slate-100 text-slate-600",
};

const LABELS = {
    account_requests: "à traiter",
    submissions: "dépôts à vérifier",
    class_requests: "demandes de classe",
    reports: "nouveaux",
    feedbacks: "nouveaux",
    recommended: "à lire",
    messages: "non lus",
    staff_messages: "non lus",
    notifications: "non lues",
    drafts: "brouillons",
    trash: "éléments",
};

// Compteurs du menu latéral : rechargés à chaque changement de page, après « Actualiser »
// et toutes les 60 s quand l'onglet est visible.
export function useNavBadges() {
    const [badges, setBadges] = useState({});
    const { pathname } = useLocation();
    const refreshCount = useRefresh()?.refreshCount;

    useEffect(() => {
        let mounted = true;
        const load = () => api.getNavBadges().then((b) => mounted && setBadges(b || {})).catch(() => {});
        const onVisible = () => document.visibilityState === "visible" && load();

        load();
        const interval = setInterval(onVisible, 60000);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            mounted = false;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [pathname, refreshCount]);

    return badges;
}

export default function NavBadge({ name, count, active }) {
    if (!name || !count) return null;
    const tone = TONES[name] || "neutral";
    // Entrée active (fond bleu marine) : pastille blanche, texte marine fixe (lisible aussi en mode sombre).
    const cls = active ? "bg-white text-[#11116f]" : TONE_CLASSES[tone];

    return (
        <span
            className={`inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums ${cls}`}
            aria-label={`${count} ${LABELS[name] || ""}`.trim()}
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}
