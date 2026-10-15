import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, FileText, ArrowRight, Command } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

// Événement qui ouvre la palette depuis un bouton (en-tête), en plus du raccourci clavier ⌘K / Ctrl+K.
export const OPEN_PALETTE_EVENT = "bm:open-command-palette";

export function openCommandPalette() {
    window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

// Destinations proposées par rôle, avec les mêmes libellés que les menus. Une page protégée par une permission
// (`permission` / `permissions`) n'est listée que si le compte la possède : jamais de cul-de-sac « accès refusé ».
// `keywords` : autres mots qui retrouvent la page (« bibliographie » → Mes cours).
const MEMBER_END = [
    { to: "/notifications", label: "Notifications" },
    { to: "/messages", label: "Messages", keywords: "boîte de réception reçus" },
    { to: "/avis-suggestions", label: "Avis & Suggestions" },
    { to: "/signaler-un-probleme", label: "Signaler un problème", keywords: "bug erreur" },
    { to: "/profil", label: "Mon profil", keywords: "compte mot de passe photo" },
];
const MEMBER_LIBRARY = [
    { to: "/mes-lectures", label: "Mes lectures", keywords: "reprendre lecture" },
    { to: "/mes-favoris", label: "Mes favoris" },
    { to: "/mes-activites", label: "Mes activités", keywords: "historique" },
];
// Espace personnel du personnel (menu Profil) : boîte de réception, lectures, favoris.
const STAFF_PERSONAL = [
    { to: "/messages", label: "Messages reçus", keywords: "boîte de réception profil" },
    { to: "/mes-lectures", label: "Mes lectures" },
    { to: "/mes-favoris", label: "Mes favoris" },
    { to: "/profil", label: "Mon profil", keywords: "compte mot de passe photo" },
];

const NAV_BY_ROLE = {
    administrateur: [
        { to: "/administrateur/statistiques", label: "Statistiques", keywords: "rapport chiffres" },
        { to: "/administrateur/assistant", label: "Assistant IA" },
        { to: "/administrateur/documents", label: "Documents" },
        { to: "/administrateur/documents/nouveau", label: "Ajouter un document", keywords: "nouveau pdf" },
        { to: "/administrateur/bibliotheques", label: "Bibliothèques" },
        { to: "/administrateur/comptes", label: "Comptes à valider", keywords: "demandes" },
        { to: "/administrateur/utilisateurs", label: "Utilisateurs", keywords: "membres étudiants" },
        { to: "/administrateur/bibliothecaires", label: "Bibliothécaires" },
        { to: "/administrateur/permissions", label: "Gestion des permissions", keywords: "droits" },
        { to: "/administrateur/popularite", label: "Popularité" },
        { to: "/administrateur/avis", label: "Avis des utilisateurs" },
        { to: "/administrateur/signalements", label: "Signalements" },
        { to: "/administrateur/messages", label: "Messages aux utilisateurs", keywords: "envoyer" },
        { to: "/administrateur/discussions", label: "Discussion avec les bibliothécaires", keywords: "chat" },
        { to: "/administrateur/notifications", label: "Notifications" },
        { to: "/administrateur/activites", label: "Mes activités" },
        { to: "/administrateur/historique", label: "Historique global", keywords: "journal audit" },
        { to: "/administrateur/corbeille", label: "Corbeille", keywords: "supprimés restaurer" },
        { to: "/administrateur/parametres", label: "Paramètres", keywords: "réglages" },
        { to: "/administrateur/parametres/page-accueil", label: "Modifier la page d'accueil", keywords: "paramètres" },
        { to: "/administrateur/parametres/apparence", label: "Apparence du site", keywords: "couleurs thème paramètres" },
        ...STAFF_PERSONAL,
    ],
    bibliothecaire: [
        { to: "/bibliothecaire/tableau-de-bord", label: "Tableau de bord" },
        { to: "/bibliothecaire/statistiques", label: "Statistiques", permission: "voir_statistiques" },
        { to: "/bibliothecaire/assistant", label: "Assistant IA" },
        { to: "/bibliothecaire/catalogue", label: "Catalogue" },
        { to: "/bibliothecaire/documents", label: "Documents" },
        { to: "/bibliothecaire/documents/nouveau", label: "Ajouter un document", keywords: "nouveau pdf" },
        { to: "/bibliothecaire/bibliotheques", label: "Bibliothèques", permissions: ["voir_bibliotheques", "ajouter_bibliotheque", "modifier_bibliotheque"] },
        { to: "/bibliothecaire/tickets-comptes", label: "Demandes de compte" },
        { to: "/bibliothecaire/creer-demande-compte", label: "Ajouter un utilisateur", permission: "ajouter_utilisateur" },
        { to: "/bibliothecaire/popularite", label: "Popularité", permission: "voir_popularite" },
        { to: "/bibliothecaire/avis", label: "Avis des utilisateurs", permission: "voir_avis_utilisateurs" },
        { to: "/bibliothecaire/signalements", label: "Signalements", permission: "voir_signalements" },
        { to: "/bibliothecaire/messages", label: "Messages aux utilisateurs", keywords: "envoyer" },
        { to: "/bibliothecaire/discussions", label: "Discussion avec l’administrateur", keywords: "chat" },
        { to: "/bibliothecaire/notifications", label: "Notifications" },
        { to: "/bibliothecaire/activites", label: "Mes activités" },
        { to: "/bibliothecaire/corbeille", label: "Corbeille", permission: "voir_corbeille", keywords: "supprimés restaurer" },
        ...STAFF_PERSONAL,
    ],
    etudiant: [
        { to: "/tableau-de-bord", label: "Tableau de bord" },
        { to: "/recherche", label: "Catalogue" },
        { to: "/lectures-recommandees", label: "Lectures recommandées", keywords: "enseignant cours" },
        ...MEMBER_LIBRARY,
        ...MEMBER_END,
    ],
    enseignant: [
        { to: "/tableau-de-bord", label: "Tableau de bord" },
        { to: "/recherche", label: "Catalogue" },
        { to: "/configuration", label: "Paramètre de configuration", keywords: "classes niveaux établissement" },
        { to: "/mes-cours", label: "Mes cours", keywords: "bibliographie classe" },
        { to: "/mes-depots", label: "Mes dépôts", keywords: "support pdf" },
        { to: "/questions-revision", label: "Questions de révision" },
        ...MEMBER_LIBRARY,
        ...MEMBER_END,
    ],
    chercheur: [
        { to: "/tableau-de-bord", label: "Tableau de bord" },
        { to: "/recherche", label: "Catalogue" },
        { to: "/espace-recherche", label: "Espace recherche" },
        { to: "/veille-scientifique", label: "Veille scientifique" },
        ...MEMBER_LIBRARY,
        ...MEMBER_END,
    ],
};

// Disponible pour tout le monde, même sans être connecté.
const PUBLIC_NAV = [
    { to: "/", label: "Accueil" },
    { to: "/recherche", label: "Catalogue" },
];

// Même règle que la barre latérale du bibliothécaire : l'administrateur a toutes les permissions.
function allowed(item, user) {
    if (!item.permission && !item.permissions) return true;
    if (user.role === "administrateur") return true;
    if (item.permission) return Boolean(user.permissions?.includes(item.permission));
    return item.permissions.some((permission) => user.permissions?.includes(permission));
}

function navFor(user) {
    if (!user) return PUBLIC_NAV;
    const base = NAV_BY_ROLE[user.role] || [{ to: "/tableau-de-bord", label: "Tableau de bord" }, ...MEMBER_LIBRARY, ...MEMBER_END];
    return [{ to: "/", label: "Accueil" }, ...base.filter((item) => allowed(item, user))];
}

// Bouton de l'en-tête : rend la recherche rapide visible (et utilisable sur téléphone, sans clavier).
export function CommandPaletteButton() {
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

    return (
        <button
            type="button"
            onClick={openCommandPalette}
            // Masqué sur téléphone (place limitée dans l'en-tête) : la recherche rapide y est dans le menu ☰.
            className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-surface px-2.5 text-slate-700 hover:bg-slate-100 sm:flex"
            aria-label="Recherche rapide : pages et documents"
            title={`Recherche rapide (${isMac ? "⌘" : "Ctrl"}+K)`}
        >
            <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[0.7rem] font-semibold text-slate-500 lg:inline">
                {isMac ? "⌘" : "Ctrl"} K
            </kbd>
        </button>
    );
}

// Normalisation accent-insensible pour un filtrage tolérant.
function fold(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function CommandPalette() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [docs, setDocs] = useState([]);
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    // Ouverture/fermeture au clavier (⌘K / Ctrl+K), fermeture sur Échap.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                setOpen((v) => !v);
            } else if (e.key === "Escape") {
                setOpen(false);
            }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener("keydown", onKey);
        window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
        };
    }, []);

    // À l'ouverture : focus, réinitialisation.
    useEffect(() => {
        if (open) {
            setQuery("");
            setDocs([]);
            setActive(0);
            const t = setTimeout(() => inputRef.current?.focus(), 20);
            return () => clearTimeout(t);
        }
    }, [open]);

    // Recherche de documents en direct (publiés), avec léger debounce et annulation.
    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setDocs([]);
            return;
        }
        let cancelled = false;
        const t = setTimeout(() => {
            api
                .getSearchSuggestions(q)
                .then((r) => !cancelled && setDocs((r?.documents || []).slice(0, 6)))
                .catch(() => !cancelled && setDocs([]));
        }, 180);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [query]);

    const pages = useMemo(() => {
        const items = navFor(user);
        const q = fold(query.trim());
        if (!q) return items;
        return items.filter((i) => fold(i.label).includes(q) || fold(i.to).includes(q) || fold(i.keywords).includes(q));
    }, [user, query]);

    // Liste à plat pour la navigation clavier (pages puis documents).
    const flat = useMemo(() => {
        const list = pages.map((p) => ({ type: "page", to: p.to, label: p.label }));
        docs.forEach((d) => list.push({ type: "doc", to: `/documents/${d.slug}`, label: d.title, meta: d.year }));
        return list;
    }, [pages, docs]);

    useEffect(() => {
        setActive((a) => Math.min(a, Math.max(flat.length - 1, 0)));
    }, [flat.length]);

    const go = useCallback(
        (item) => {
            if (!item) return;
            setOpen(false);
            navigate(item.to);
        },
        [navigate],
    );

    const onKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, flat.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            go(flat[active]);
        }
    };

    // Garde l'élément actif visible.
    useEffect(() => {
        if (!open) return;
        const el = listRef.current?.querySelector(`[data-index="${active}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [active, open]);

    if (!open) return null;

    const docStart = pages.length;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Palette de commandes"
        >
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                    <Search className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden="true" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Rechercher un document, une page…"
                        aria-label="Rechercher"
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
                    />
                    <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[0.7rem] text-ink-soft sm:inline">Échap</kbd>
                </div>

                <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
                    {flat.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-ink-soft">Aucun résultat pour « {query} ».</p>
                    )}

                    {pages.length > 0 && (
                        <div className="px-2 pb-1 pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-ink-soft">Navigation</div>
                    )}
                    {pages.map((p, i) => (
                        <button
                            key={p.to}
                            type="button"
                            data-index={i}
                            onMouseMove={() => setActive(i)}
                            onClick={() => go({ to: p.to })}
                            aria-selected={active === i}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
                                active === i ? "bg-paper-dim text-ink" : "text-ink"
                            }`}
                        >
                            <ArrowRight className="h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{p.label}</span>
                            {active === i && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden="true" />}
                        </button>
                    ))}

                    {docs.length > 0 && (
                        <div className="px-2 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-wider text-ink-soft">Documents</div>
                    )}
                    {docs.map((d, j) => {
                        const i = docStart + j;
                        return (
                            <button
                                key={d.slug}
                                type="button"
                                data-index={i}
                                onMouseMove={() => setActive(i)}
                                onClick={() => go({ to: `/documents/${d.slug}` })}
                                aria-selected={active === i}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
                                    active === i ? "bg-paper-dim text-ink" : "text-ink"
                                }`}
                            >
                                <FileText className="h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                                {d.year && <span className="shrink-0 text-xs text-ink-soft">{d.year}</span>}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[0.72rem] text-ink-soft">
                    <span className="flex items-center gap-1"><Command className="h-3 w-3" strokeWidth={2} aria-hidden="true" />K pour ouvrir</span>
                    <span>↑ ↓ naviguer</span>
                    <span>↵ ouvrir</span>
                </div>
            </div>
        </div>
    );
}
