import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { api } from "../lib/api";
import { DEFAULT_SECTIONS, PREVIEW_MESSAGE, PREVIEW_READY } from "../lib/homepage";
import HomeSections from "../components/home/HomeSections";
import { Skeleton } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";

/**
 * Page d'accueil publique : affiche la dernière version publiée par l'administrateur,
 * ou le contenu d'origine (DEFAULT_SECTIONS) si rien n'est encore publié.
 *
 * preview : aperçu réservé à l'administrateur (route /apercu-page-accueil).
 *  - intégré dans l'éditeur (iframe) : reçoit les sections en direct via postMessage ;
 *  - ouvert dans un onglet : affiche le brouillon enregistré.
 */
export default function HomePage({ preview = false }) {
    const { user, isLoggingOut } = useAuth();
    const [sections, setSections] = useState(null);
    const [previewLabel, setPreviewLabel] = useState("Aperçu du brouillon");

    useEffect(() => {
        if (!preview) {
            api.getHomepage()
                .then((r) => setSections(r.sections ?? DEFAULT_SECTIONS))
                .catch(() => setSections(DEFAULT_SECTIONS));
            return undefined;
        }

        const embedded = window.parent !== window;
        if (!embedded) {
            api.getHomepageAdmin()
                .then((r) => {
                    setSections(r.draft?.sections ?? r.published?.sections ?? DEFAULT_SECTIONS);
                    if (!r.draft) setPreviewLabel("Aucun brouillon : version actuellement publiée");
                })
                .catch(() => setSections(DEFAULT_SECTIONS));
            return undefined;
        }

        // Seul l'éditeur de la même origine peut piloter l'aperçu.
        function onMessage(event) {
            if (event.origin !== window.location.origin || event.data?.type !== PREVIEW_MESSAGE) return;
            if (Array.isArray(event.data.sections)) setSections(event.data.sections);
            if (event.data.label) setPreviewLabel(event.data.label);
        }
        window.addEventListener("message", onMessage);
        window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);

        return () => window.removeEventListener("message", onMessage);
    }, [preview]);

    if (!sections) {
        return (
            <div className="umg-container pt-6" role="status" aria-busy="true" aria-label="Chargement de la page d'accueil">
                <Skeleton className="block h-[430px] w-full rounded-lg" />
            </div>
        );
    }

    return (
        <div>
            {preview && (
                <div className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-700">
                    <Eye className="h-4 w-4 shrink-0" />
                    {previewLabel} — non visible par le public
                </div>
            )}
            {/* En aperçu, les liens et la recherche sont neutralisés pour rester sur la page. */}
            <div
                onClickCapture={
                    preview
                        ? (event) => {
                              if (event.target.closest("a")) event.preventDefault();
                          }
                        : undefined
                }
                onSubmitCapture={
                    preview
                        ? (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                          }
                        : undefined
                }
            >
                <HomeSections sections={sections} user={user} isLocked={isLoggingOut} preview={preview} />
            </div>
        </div>
    );
}
