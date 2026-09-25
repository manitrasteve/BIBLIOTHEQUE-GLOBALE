import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { api } from "../lib/api";
import CatalogueCard, { CATALOGUE_GRID_CLASS } from "../components/CatalogueCard";
import { useFavoriteToggle } from "../lib/useFavoriteToggle";

export default function FavoritesPage() {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);

    async function load() {
        setError(null);

        try {
            const response = await api.getFavorites();
            setItems(Array.isArray(response?.data) ? response.data : []);
        } catch (err) {
            setError(
                err?.data?.message || "Impossible de charger vos favoris.",
            );
            setItems([]);
        }
    }

    useEffect(() => {
        load();
    }, []);

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
        </div>
    );
}
