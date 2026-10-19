// Assistant IA d'une fiche document : la page s'annonce ici pour que le robot flottant
// sache l'ouvrir (onglet « Assistant IA ») et se cacher quand il est déjà ouvert.
let current = null;
const listeners = new Set();

function emit() {
    listeners.forEach((listener) => listener());
}

// entry = { active: boolean, open: () => void } ; renvoie la fonction de désinscription.
export function registerDocAssistant(entry) {
    current = entry;
    emit();

    return () => {
        if (current === entry) {
            current = null;
            emit();
        }
    };
}

export function subscribeDocAssistant(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getDocAssistant() {
    return current;
}
