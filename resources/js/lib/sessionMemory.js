// Mémoire temporaire de navigation (en RAM uniquement) : survit aux
// changements de route, mais disparaît à la fermeture/actualisation de
// l'application et à la déconnexion. Rien n'est écrit dans localStorage
// ni en base de données.
const readerPages = new Map();
const aiChats = new Map();

export const sessionMemory = {
    getReaderPage: (slug) => readerPages.get(slug) ?? null,
    setReaderPage: (slug, page) => readerPages.set(slug, page),
    getAiChat: (slug) => aiChats.get(slug) ?? [],
    setAiChat: (slug, exchanges) => aiChats.set(slug, exchanges),
    clear() {
        readerPages.clear();
        aiChats.clear();
    },
};
