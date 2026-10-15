import { useEffect, useState } from "react";

// Installation de l'application (PWA).
//  - Chrome / Edge (PC, Android) envoient « beforeinstallprompt » quand l'installation est possible : on le garde
//    pour afficher la fenêtre d'installation au clic sur NOTRE bouton. Cet événement arrive souvent avant que
//    React ait affiché la page : ce module est donc importé tôt (main.jsx).
//  - Sinon (iPhone, adresse HTTP, navigateur qui ne l'a pas encore proposé…) : le bouton reste affiché et
//    ouvre des étapes guidées adaptées à l'appareil (menu du navigateur → Ajouter à l'écran d'accueil / Installer).
//  - Rien n'est proposé quand l'application est ouverte depuis son icône, ou vient d'être installée.

const INSTALLED_KEY = "bm_app_installed";

let deferredPrompt = null;
let installed = readInstalled();
const listeners = new Set();

function readInstalled() {
    try {
        return window.localStorage.getItem(INSTALLED_KEY) === "1";
    } catch {
        return false;
    }
}

function writeInstalled(value) {
    installed = value;
    try {
        if (value) window.localStorage.setItem(INSTALLED_KEY, "1");
        else window.localStorage.removeItem(INSTALLED_KEY);
    } catch {
        // stockage indisponible : l'état reste en mémoire pour cette visite
    }
}

function notify() {
    listeners.forEach((listener) => listener());
}

function isStandalone() {
    return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true // Safari iOS
    );
}

export function isIos() {
    const ua = window.navigator.userAgent || "";
    // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
    return /iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

/** Appareil / navigateur, pour afficher les bonnes étapes : ios, samsung, android, edge, chrome, other. */
export function platform() {
    const ua = window.navigator.userAgent || "";
    if (isIos()) return "ios";
    if (/SamsungBrowser/i.test(ua)) return "samsung";
    if (/Android/i.test(ua)) return "android";
    if (/Edg\//.test(ua)) return "edge";
    if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) return "chrome";
    return "other";
}

/** Adresse sécurisée (HTTPS ou localhost) : sinon le navigateur ne propose qu'un raccourci. */
export function isSecure() {
    return window.isSecureContext === true;
}

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault(); // pas de mini-bandeau automatique : le site affiche ses propres boutons
        deferredPrompt = event;
        // Le navigateur propose l'installation : l'application n'est donc pas (ou plus) installée.
        if (installed) writeInstalled(false);
        notify();
    });

    window.addEventListener("appinstalled", () => {
        writeInstalled(true);
        deferredPrompt = null;
        notify();
    });
}

/**
 * « prompt » (fenêtre d'installation du navigateur), « guide » (étapes guidées) ou null (application
 * ouverte depuis son icône, ou installée : rien à proposer).
 */
function currentMode() {
    if (installed || isStandalone()) return null;
    if (deferredPrompt) return "prompt";
    return "guide";
}

/** Affiche la fenêtre d'installation du navigateur. Renvoie true si l'utilisateur a accepté. */
export async function promptInstall() {
    if (!deferredPrompt) return false;
    const event = deferredPrompt;
    deferredPrompt = null; // un événement ne sert qu'une fois
    notify();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
        writeInstalled(true);
        notify();
    }
    return outcome === "accepted";
}

export function useInstallApp() {
    const [mode, setMode] = useState(currentMode);

    useEffect(() => {
        const update = () => setMode(currentMode());
        listeners.add(update);
        update();
        return () => listeners.delete(update);
    }, []);

    return mode;
}

// Petites préférences locales (badge « Nouveau », bandeau masqué) : sans stockage, on fait comme si rien n'était mémorisé.
export const installPrefs = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // navigation privée, stockage bloqué : sans conséquence
        }
    },
};
