import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { api } from "../lib/api";
import CatalogueCard, { CATALOGUE_GRID_CLASS } from "../components/CatalogueCard";
import Pager from "../components/Pager";
import { usePageRefresh } from "../context/RefreshContext";
import { useFavoriteToggle } from "../lib/useFavoriteToggle";

// Copie locale des favoris (métadonnées seulement, jamais le PDF) pour les consulter hors ligne.
// Effacée à la déconnexion (AuthContext.forgetUser).
const OFFLINE_KEY = "bm_offline_favorites";

function saveOffline(page, response) {
    try {
        const saved = JSON.parse(localStorage.getItem(OFFLINE_KEY)) || { pages: {} };
        saved.pages[page] = response;
        saved.savedAt = new Date().toISOString();
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(saved));
    } catch {
        // stockage plein ou indisponible : pas de copie hors ligne
    }
}

function readOffline(page) {
    try {
        const saved = JSON.parse(localStorage.getItem(OFFLINE_KEY));
        const response = saved?.pages?.[page];
        return response ? { response, savedAt: saved.savedAt } : null;
    } catch {
        return null;
    }
}

export default function FavoritesPage() {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    // Pagination du serveur (20 par page) : sans elle, seuls les 20 derniers favoris étaient visibles.
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState(null);
    const [offlineSince, setOfflineSince] = useState(null);

    async function load() {
        setError(null);
        setOfflineSince(null);

        try {
            const response = await api.getFavorites(page);
            setItems(Array.isArray(response?.data) ? response.data : []);
            setMeta(response);
            saveOffline(page, response);
        } catch (err) {
            // Pas de réponse du serveur : dernière liste enregistrée sur cet appareil, si elle existe.
            const offline = !err?.status ? readOffline(page) : null;
            if (offline) {
                setItems(offline.response.data || []);
                setMeta(offline.response);
                setOfflineSince(offline.savedAt);
                return;
            }
            setError(
                err?.data?.message || "Impossible de charger vos favoris.",
            );
            setItems([]);
        }
    }

    useEffect(() => {
        load();
    }, [page]);

    // Actualisation : en cas d'échec, la liste affichée est conservée (pas de bascule vers la copie hors ligne).
    usePageRefresh(async () => {
        const response = await api.getFavorites(page);
        setItems(Array.isArray(response?.data) ? response.data : []);
        setMeta(response);
        saveOffline(page, response);
        setError(null);
        setOfflineSince(null);
    });

    // Le cœur retire le document de la liste ; il y revient à sa place si le serveur refuse.
    const toggleFavorite = useFavoriteToggle((slug, favorited) =>
        setItems((current) =>
            (current || []).map((item) =>
                item?.document?.slug === slug
                    ? { ...item, removed: !favorited }
                    : item,
            ),
        ),
    );

    const visible = (items || []).filter((item) => item?.document && !item.removed);

    return (
        <div>
            <div className="mb-6 flex items-center gap-2">
                <Heart className="h-5 w-5 fill-brass text-brass" />
                <h2 className="font-display text-xl font-extrabold">
                    Mes favoris
                </h2>
            </div>

            {error && (
                <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                </p>
            )}

            {offlineSince && (
                <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
                    Vous êtes hors ligne : voici votre liste enregistrée le{" "}
                    {new Date(offlineSince).toLocaleString("fr-FR")}. La lecture des documents nécessite une connexion.
                </p>
            )}

            {items === null ? (
                <p className="text-slate-500">Chargement…</p>
            ) : visible.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucun document dans vos favoris.
                </div>
            ) : (
                <div className={CATALOGUE_GRID_CLASS}>
                    {visible.map((item) => (
                        <CatalogueCard
                            key={item.id}
                            document={{ ...item.document, is_favorited: true }}
                            onToggleFavorite={toggleFavorite}
                        />
                    ))}
                </div>
            )}

            <Pager meta={meta} onChange={setPage} />
        </div>
    );
}
