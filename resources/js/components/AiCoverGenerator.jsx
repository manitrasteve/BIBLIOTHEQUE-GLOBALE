import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, Check, ImagePlus } from "lucide-react";
import { api } from "../lib/api";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // ≈ 3 minutes

// Image renvoyée en data URL → fichier, envoyé ensuite comme une couverture choisie à la main.
function dataUrlToFile(dataUrl, mime) {
    const binary = atob(dataUrl.split(",")[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const extension = { "image/png": "png", "image/webp": "webp" }[mime] || "jpg";
    return new File([bytes], `couverture-ia.${extension}`, { type: mime });
}

/**
 * « Générer une couverture par IA » dans le formulaire d'un document (Pollinations,
 * avec une couverture dessinée par le serveur si le service échoue).
 * La génération est lancée puis son état interrogé toutes les 3 s ; l'image obtenue
 * n'est utilisée que si l'utilisateur la valide (onUse reçoit un File).
 */
export default function AiCoverGenerator({ fields, current, onUse }) {
    const [phase, setPhase] = useState("idle"); // idle | running | done | error
    const [message, setMessage] = useState(null);
    const [preview, setPreview] = useState(null); // { image, mime }
    const [usedFile, setUsedFile] = useState(null);
    const [instructions, setInstructions] = useState("");
    const timer = useRef(null);
    const run = useRef(0); // ignore les réponses d'une génération abandonnée

    useEffect(
        () => () => {
            clearTimeout(timer.current);
            run.current++; // une réponse en cours après la fermeture du formulaire est ignorée
        },
        [],
    );

    async function poll(requestId, runId, attempt) {
        if (run.current !== runId) return;
        if (attempt >= MAX_POLLS) {
            setPhase("error");
            setMessage("La génération prend trop de temps. Réessayez.");
            return;
        }
        try {
            const res = await api.getAiCoverStatus(requestId);
            if (run.current !== runId) return;
            if (res.status === "completed" && res.image) {
                setPreview({ image: res.image, mime: res.mime });
                setPhase("done");
                setMessage(
                    res.source === "fallback"
                        ? "Le service d'IA n'a pas répondu : voici une couverture dessinée automatiquement à partir du titre. Vous pouvez l'utiliser ou réessayer."
                        : null,
                );
                return;
            }
            if (["failed", "nsfw", "canceled"].includes(res.status)) {
                setPhase("error");
                setMessage(res.message || "La génération a échoué.");
                return;
            }
            timer.current = setTimeout(() => poll(requestId, runId, attempt + 1), POLL_INTERVAL_MS);
        } catch (err) {
            if (run.current !== runId) return;
            // 429 : trop de vérifications, on patiente un peu plus.
            if (err.status === 429) {
                timer.current = setTimeout(() => poll(requestId, runId, attempt + 1), POLL_INTERVAL_MS * 2);
                return;
            }
            setPhase("error");
            setMessage(err.data?.message || "La génération a échoué.");
        }
    }

    async function generate() {
        if (!fields.title?.trim()) {
            setPhase("error");
            setMessage("Saisissez d'abord le titre du document.");
            return;
        }
        clearTimeout(timer.current);
        const runId = ++run.current;
        setPhase("running");
        setMessage(null);
        setPreview(null);
        setUsedFile(null);
        try {
            const res = await api.generateAiCover({ ...fields, instructions });
            timer.current = setTimeout(() => poll(res.request_id, runId, 0), POLL_INTERVAL_MS);
        } catch (err) {
            if (run.current !== runId) return;
            setPhase("error");
            setMessage(
                err.status === 429
                    ? "Trop de générations en peu de temps : patientez une minute."
                    : err.data?.errors
                      ? Object.values(err.data.errors)[0][0]
                      : err.data?.message || "La génération a échoué.",
            );
        }
    }

    function applyCover() {
        const file = dataUrlToFile(preview.image, preview.mime);
        setUsedFile(file);
        onUse(file);
    }

    // Sélectionnée tant qu'aucune autre image n'a été choisie à la main entre-temps.
    const used = Boolean(usedFile) && current === usedFile && preview !== null;

    return (
        <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={generate}
                    disabled={phase === "running"}
                    className="btn-secondary disabled:opacity-50"
                >
                    {phase === "running" ? (
                        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                    )}
                    {phase === "running"
                        ? "Génération en cours…"
                        : preview
                          ? "Régénérer"
                          : "Générer une couverture par IA"}
                </button>
                <input
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    maxLength={500}
                    placeholder="Style souhaité (optionnel) : aquarelle, minimaliste…"
                    aria-label="Style souhaité pour la couverture"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
            </div>
            <p className="text-xs text-ink-soft">
                Basée sur le titre, le type, la catégorie et le résumé. Rien n'est enregistré tant que vous ne cliquez pas sur « Utiliser ».
            </p>

            <div aria-live="polite">
                {phase === "running" && (
                    <p className="text-sm text-ink-soft">Veuillez patienter quelques secondes…</p>
                )}
                {phase === "error" && message && <p className="text-sm text-red-700">{message}</p>}
                {phase === "done" && message && <p className="text-sm text-ink-soft">{message}</p>}
            </div>

            {preview && (
                <div className="flex w-36 flex-col gap-2">
                    <img
                        src={preview.image}
                        alt="Aperçu de la couverture générée"
                        className="h-48 w-36 rounded-md border border-line object-cover"
                    />
                    {used ? (
                        <p className="flex items-center justify-center gap-1 text-sm text-brass">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Couverture sélectionnée
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={applyCover}
                            className="btn-primary self-center !gap-1.5 !px-3 !py-1 !text-xs [--btn-bg:#15803d] hover:[--btn-bg:#166534]"
                            aria-label="Utiliser cette couverture"
                        >
                            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                            Utiliser
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
