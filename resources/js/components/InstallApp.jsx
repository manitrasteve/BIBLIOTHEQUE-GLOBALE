import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Share } from "lucide-react";
import { installPrefs, isSecure, platform, promptInstall, useInstallApp } from "../lib/pwaInstall";

// Bandeau masqué par « Plus tard » : de nouveau proposé après 30 jours.
const BANNER_HIDDEN_KEY = "bm_install_banner_hidden_at";
const BANNER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function AppIcon({ className = "h-10 w-10" }) {
    return <img src="/images/pwa/icon-192.png" alt="" className={`${className} shrink-0 rounded-xl`} />;
}

const KEY = "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs font-bold text-ink";
const K = ({ children }) => <span className={KEY}>{children}</span>;

// Étapes par appareil / navigateur (libellés des menus tels qu'affichés en français).
const GUIDES = {
    ios: {
        title: "Installer sur votre iPhone",
        subtitle: "Safari ne propose pas de bouton automatique.",
        steps: [
            <>Touchez <K><Share className="h-3.5 w-3.5" aria-hidden="true" />Partager</K> en bas de Safari.</>,
            <>Choisissez <K>Sur l'écran d'accueil</K>.</>,
            <>Touchez <K>Ajouter</K> en haut à droite.</>,
        ],
    },
    android: {
        title: "Installer sur votre téléphone",
        subtitle: "Depuis le menu de Chrome.",
        steps: [
            <>Touchez <K>⋮</K> en haut à droite de Chrome.</>,
            <>Choisissez <K>Installer l'application</K> ou <K>Ajouter à l'écran d'accueil</K>.</>,
            <>Touchez <K>Installer</K> ou <K>Ajouter</K>. L'icône apparaît sur l'écran d'accueil.</>,
        ],
    },
    samsung: {
        title: "Installer sur votre téléphone",
        subtitle: "Depuis le menu de Samsung Internet.",
        steps: [
            <>Touchez <K>≡</K> en bas de l'écran.</>,
            <>Choisissez <K>Ajouter la page à</K>, puis <K>Écran d'accueil</K>.</>,
            <>Touchez <K>Ajouter</K>.</>,
        ],
    },
    edge: {
        title: "Installer sur cet ordinateur",
        subtitle: "Depuis le menu de Microsoft Edge.",
        steps: [
            <>Cliquez sur <K>…</K> en haut à droite d'Edge.</>,
            <>Choisissez <K>Applications</K>, puis <K>Installer ce site en tant qu'application</K>.</>,
            <>Cliquez sur <K>Installer</K>, puis cochez <K>Créer un raccourci sur le Bureau</K> si vous le souhaitez.</>,
        ],
    },
    chrome: {
        title: "Installer sur cet ordinateur",
        subtitle: "Depuis le menu de Google Chrome.",
        steps: [
            <>Cliquez sur <K>⋮</K> en haut à droite de Chrome.</>,
            <>Choisissez <K>Caster, enregistrer et partager</K>, puis <K>Installer la page en tant qu'application</K> (ou <K>Créer un raccourci</K>).</>,
            <>Cliquez sur <K>Installer</K>. L'application s'ajoute au menu Démarrer et au Bureau.</>,
        ],
    },
    other: {
        title: "Installer l'application",
        subtitle: "Votre navigateur ne permet pas l'installation.",
        steps: [
            <>Ouvrez ce site dans <K>Google Chrome</K> ou <K>Microsoft Edge</K> (ordinateur, Android) ou dans <K>Safari</K> (iPhone).</>,
            <>Revenez dans ce menu et touchez <K>Installer l'application</K>.</>,
        ],
    },
};

/** Étapes guidées quand le navigateur ne propose pas lui-même la fenêtre d'installation. */
export function InstallGuideDialog({ open, onClose }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => event.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const guide = GUIDES[platform()];
    // Adresse HTTP (ex. réseau local) : le navigateur crée un simple raccourci, sans le mode hors connexion.
    const insecure = !isSecure() && platform() !== "other";

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-end justify-center bg-overlay p-4 sm:items-center"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div role="dialog" aria-modal="true" aria-labelledby="install-guide-title" className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 text-ink">
                <div className="mb-4 flex items-center gap-3">
                    <AppIcon />
                    <div>
                        <h2 id="install-guide-title" className="font-display text-base font-extrabold leading-tight">{guide.title}</h2>
                        <p className="text-xs text-slate-500">{guide.subtitle}</p>
                    </div>
                </div>
                <ol className="space-y-3">
                    {guide.steps.map((content, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-600">{i + 1}</span>
                            <span className="min-w-0 pt-0.5 leading-relaxed">{content}</span>
                        </li>
                    ))}
                </ol>
                {insecure && (
                    <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-xs leading-relaxed text-slate-600">
                        Cette adresse n'est pas sécurisée (http) : vous obtiendrez un raccourci vers le site. L'installation complète,
                        avec l'ouverture hors connexion, sera disponible une fois le site en HTTPS.
                    </p>
                )}
                <button type="button" onClick={onClose} autoFocus className="btn-secondary mt-5 w-full justify-center">
                    J'ai compris
                </button>
            </div>
        </div>,
        document.body,
    );
}

/**
 * Action d'installation commune au menu du profil et au bandeau : fenêtre du navigateur quand il la propose
 * (Chrome, Edge), sinon étapes guidées. `mode` vaut null quand il n'y a rien à proposer (déjà installée).
 */
export function useInstallAction() {
    const mode = useInstallApp();
    const [guideOpen, setGuideOpen] = useState(false);

    async function install() {
        if (mode === "prompt") await promptInstall();
        else if (mode === "guide") setGuideOpen(true);
    }

    const dialog = <InstallGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />;

    return { mode, install, dialog };
}

/** Bandeau en bas de la page d'accueil, sur téléphone et tablette. */
export function InstallBanner() {
    const { pathname } = useLocation();
    const { mode, install, dialog } = useInstallAction();
    const [hidden, setHidden] = useState(() => {
        const at = Number(installPrefs.get(BANNER_HIDDEN_KEY));
        return Boolean(at) && Date.now() - at < BANNER_SNOOZE_MS;
    });
    const [smallScreen, setSmallScreen] = useState(() => window.matchMedia?.("(max-width: 1023px)").matches ?? false);

    useEffect(() => {
        const query = window.matchMedia?.("(max-width: 1023px)");
        if (!query) return undefined;
        const update = () => setSmallScreen(query.matches);
        query.addEventListener?.("change", update);
        return () => query.removeEventListener?.("change", update);
    }, []);

    function later() {
        installPrefs.set(BANNER_HIDDEN_KEY, String(Date.now()));
        setHidden(true);
    }

    if (pathname !== "/" || !mode || hidden || !smallScreen) return dialog;

    return (
        <>
            {/* Réserve la hauteur du bandeau : le bas de la page (pied de page) reste lisible au-dessus. */}
            <div aria-hidden="true" className="h-36 print:hidden" />
            <div
                role="region"
                aria-label="Installer l'application"
                className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-gold bg-surface px-4 pt-3 print:hidden"
                style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))" }}
            >
                <div className="mx-auto flex max-w-xl flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <AppIcon />
                        <div className="min-w-0">
                            <p className="text-sm font-extrabold leading-tight text-ink">Installer Bibliothèque UMG</p>
                            <p className="text-xs leading-snug text-slate-500">Ouverture en un geste depuis l'écran d'accueil, même hors connexion.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={later} className="btn-secondary flex-1 justify-center">Plus tard</button>
                        <button type="button" onClick={install} className="flex-1 rounded-xl bg-gold px-4 py-2.5 text-sm font-extrabold text-umg-night hover:bg-gold-deep">
                            Installer
                        </button>
                    </div>
                </div>
            </div>
            {dialog}
        </>
    );
}
