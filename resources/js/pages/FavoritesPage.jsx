import { useEffect, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import DocumentCard from "../components/DocumentCard";

export default function FavoritesPage() {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    const [removingId, setRemovingId] = useState(null);

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

    async function remove(document) {
        if (!document?.slug || removingId) return;

        setRemovingId(document.id);

        try {
            await api.toggleFavorite(document.slug);
            setItems((current) =>
                (current || []).filter(
                    (item) => item?.document?.id !== document.id,
                ),
            );
        } catch (err) {
            setError(
                err?.data?.message ||
                    "Impossible de retirer ce document des favoris.",
            );
        } finally {
            setRemovingId(null);
        }
    }

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
            ) : items.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucun document dans vos favoris.
                </div>
            ) : (
                <div className="grid gap-5 md:grid-cols-2">
                    {items.map((item) => {
                        const document = item?.document;
                        if (!document) return null;

                        return (
                            <div
                                key={item.id}
                                className="relative"
                            >
                                <DocumentCard document={document} />

                                <button
                                    type="button"
                                    onClick={() => remove(document)}
                                    disabled={removingId === document.id}
                                    className="absolute right-4 top-4 rounded-full bg-surface/95 p-2 text-rose-700  disabled:opacity-50"
                                    title="Retirer des favoris"
                                    aria-label="Retirer des favoris"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
