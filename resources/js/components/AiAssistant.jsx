import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Sparkles, Send, BookText, ImageIcon, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";

// Markdown + formules (KaTeX) chargés à la demande.
const AiMarkdown = lazy(() => import("./AiMarkdown"));

const SUGGESTIONS = [
    "Résume ce document.",
    "Quels sont les points importants ?",
    "Explique cette partie.",
];

function AnswerText({ text }) {
    return (
        <Suspense
            fallback={<p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>}
        >
            <AiMarkdown>{text}</AiMarkdown>
        </Suspense>
    );
}

// Ouvre l'image générée dans un nouvel onglet (les URL data: ne s'ouvrent
// pas directement dans un onglet, on passe par un Blob).
function openImage(image) {
    try {
        const binary = atob(image.data);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: image.mime }));
        window.open(url, "_blank", "noopener");
    } catch {
        // image illisible : rien à ouvrir
    }
}

export default function AiAssistant({ slug }) {
    const [question, setQuestion] = useState("");
    const [exchanges, setExchanges] = useState(() => sessionMemory.getAiChat(slug));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(null);
    const [streamText, setStreamText] = useState("");
    const [fullscreen, setFullscreen] = useState(false);
    const mountedRef = useRef(true);
    const scrollRef = useRef(null);
    const rootRef = useRef(null);
    const nativeFullscreenRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [exchanges.length, pending, streamText, fullscreen]);

    // Plein écran natif : Échap le quitte (le navigateur nous prévient ici).
    useEffect(() => {
        function onChange() {
            if (document.fullscreenElement === rootRef.current) {
                nativeFullscreenRef.current = true;
                setFullscreen(true);
            } else if (nativeFullscreenRef.current) {
                nativeFullscreenRef.current = false;
                setFullscreen(false);
            }
        }

        document.addEventListener("fullscreenchange", onChange);
        return () => {
            document.removeEventListener("fullscreenchange", onChange);
            if (document.fullscreenElement === rootRef.current) {
                document.exitFullscreen?.();
            }
        };
    }, []);

    // Repli sans API native (ex. Safari iPhone) : plein écran CSS, Échap pour quitter.
    useEffect(() => {
        if (!fullscreen || nativeFullscreenRef.current) return undefined;

        function onKey(event) {
            if (event.key === "Escape") setFullscreen(false);
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [fullscreen]);

    function toggleFullscreen() {
        if (document.fullscreenElement === rootRef.current) {
            document.exitFullscreen();
            return;
        }

        if (fullscreen) {
            setFullscreen(false);
            return;
        }

        const el = rootRef.current;

        if (el?.requestFullscreen) {
            el.requestFullscreen().catch(() => setFullscreen(true));
        } else {
            setFullscreen(true);
        }
    }

    async function ask(q) {
        const finalQuestion = (q ?? question).trim();

        if (!finalQuestion || loading) return;

        setLoading(true);
        setError(null);
        setQuestion("");
        setPending(finalQuestion);
        setStreamText("");

        // Contexte : derniers échanges de la conversation temporaire + page
        // actuellement ouverte dans le lecteur (jamais stockés côté serveur).
        const history = sessionMemory
            .getAiChat(slug)
            .slice(-4)
            .map((ex) => ({ question: ex.question, answer: ex.answer }));
        const page = sessionMemory.getReaderPage(slug);
        const extra = { history, ...(page ? { current_page: page } : {}) };

        let streamed = false;

        try {
            let result;

            try {
                result = await api.askAiStream(slug, finalQuestion, extra, {
                    onDelta: (delta) => {
                        streamed = true;
                        if (mountedRef.current) setStreamText((t) => t + delta);
                    },
                });
            } catch (err) {
                // Le flux n'a pas pu démarrer : repli sur la requête classique.
                if (err.streamed || streamed) throw err;
                result = await api.askAi(slug, finalQuestion, extra);
            }

            const next = [
                ...sessionMemory.getAiChat(slug),
                {
                    question: finalQuestion,
                    answer: result.answer,
                    sources: result.sources || [],
                    image: result.image || null,
                    meta: result.meta || null,
                },
            ];
            sessionMemory.setAiChat(slug, next);
            if (mountedRef.current) setExchanges(next);
        } catch (err) {
            if (mountedRef.current) {
                setError(
                    err?.data?.message ||
                        (err?.streamed ? err.message : null) ||
                        "L'assistant n'a pas pu répondre pour le moment.",
                );
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setPending(null);
                setStreamText("");
            }
        }
    }

    return (
        <div
            ref={rootRef}
            className={
                fullscreen
                    ? "fixed inset-0 z-[60] flex h-screen w-screen flex-col rounded-none border-0 bg-paper p-4 sm:p-4"
                    : "rounded-xl border border-line bg-paper-dim/40 p-4 flex flex-col reader-panel-height"
            }
        >
            {/* En-tête */}
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <p className="flex items-center gap-2 font-display text-lg text-ink">
                        <Sparkles
                            className="h-4 w-4 text-brass/70"
                            strokeWidth={1.75}
                        />
                        Assistant IA
                    </p>

                    <p className="text-xs text-ink-soft mt-1">
                        Les réponses se basent uniquement sur le contenu de ce
                        document.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {fullscreen && (
                        <span className="hidden text-xs text-ink-soft sm:inline">
                            Échap pour quitter
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="rounded-lg border border-line p-1.5 text-ink-soft transition-colors hover:border-brass hover:text-brass"
                        title={fullscreen ? "Quitter le plein écran (Échap)" : "Plein écran"}
                        aria-label={fullscreen ? "Quitter le plein écran" : "Afficher en plein écran"}
                    >
                        {fullscreen ? (
                            <Minimize2 className="h-4 w-4" />
                        ) : (
                            <Maximize2 className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Zone des conversations */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-2">
                {/* Suggestions */}
                {exchanges.length === 0 && !pending && (
                    <div className="flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                onClick={() => ask(s)}
                                disabled={loading}
                                className="text-xs rounded-full border border-line px-3 py-1.5 text-ink-soft hover:border-brass hover:text-brass transition-colors disabled:opacity-50"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                {/* Conversations */}
                {exchanges.map((ex, i) => {
                    // Trier les sources par numéro de page
                    // et supprimer les doublons.
                    const sortedSources = Array.from(
                        new Map(
                            (ex.sources || [])
                                .filter((source) => source?.page != null)
                                .map((source) => [Number(source.page), source]),
                        ).values(),
                    ).sort((a, b) => Number(a.page) - Number(b.page));

                    return (
                        <div key={i} className="space-y-3">
                            {/* Question de l'utilisateur */}
                            <div className="flex justify-end">
                                <div className="max-w-[80%]">
                                    <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3 ">
                                        <p className="text-sm whitespace-pre-wrap">
                                            {ex.question}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Réponse de l'IA */}
                            <div className="flex justify-start">
                                <div className="max-w-[85%] w-fit min-w-0">
                                    <div className="bg-surface text-slate-950 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 ">
                                        {/* Icône IA */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles
                                                className="h-3.5 w-3.5 text-brass/70"
                                                strokeWidth={1.75}
                                            />

                                            <span className="text-xs font-medium text-gray-600">
                                                Assistant IA
                                            </span>
                                        </div>

                                        {/* Texte de la réponse */}
                                        <AnswerText text={ex.answer} />

                                        {/* Image générée à la demande */}
                                        {ex.image && (
                                            <button
                                                type="button"
                                                onClick={() => openImage(ex.image)}
                                                className="mt-3 block w-full text-left"
                                                title="Ouvrir l'image dans un nouvel onglet"
                                            >
                                                <img
                                                    src={`data:${ex.image.mime};base64,${ex.image.data}`}
                                                    alt="Illustration générée par l'IA"
                                                    className="max-h-80 w-auto max-w-full rounded-lg border border-gray-200"
                                                />
                                                <span className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                                    <ImageIcon className="h-3 w-3" />
                                                    Image générée par l'IA — cliquer pour l'agrandir
                                                </span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Transparence sur l'analyse visuelle */}
                                    {ex.meta?.visual && (
                                        <p className="mt-2 text-xs text-ink-soft">
                                            Analyse basée sur le texte et sur les éléments visuels du PDF.
                                        </p>
                                    )}
                                    {ex.meta?.visual_requested && !ex.meta?.visual && (
                                        <p className="mt-2 text-xs text-ink-soft">
                                            Les éléments visuels du document n'ont pas pu être analysés
                                            (réponse basée sur le texte uniquement).
                                        </p>
                                    )}

                                    {/* Sources */}
                                    {sortedSources.length > 0 && (
                                        <div className="mt-2 flex items-center gap-1.5 text-xs text-brass">
                                            <BookText
                                                className="h-3.5 w-3.5 flex-shrink-0"
                                                strokeWidth={1.75}
                                            />

                                            <span>
                                                Sources :{" "}
                                                {sortedSources
                                                    .map(
                                                        (source) =>
                                                            `p. ${source.page}`,
                                                    )
                                                    .join(" · ")}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Question en cours + réponse en train d'arriver (streaming) */}
                {pending && (
                    <div className="space-y-3">
                        <div className="flex justify-end">
                            <div className="max-w-[80%]">
                                <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3 ">
                                    <p className="text-sm whitespace-pre-wrap">
                                        {pending}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-start">
                            <div className="max-w-[85%] w-fit min-w-0">
                                <div className="bg-surface border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 ">
                                    <div className="flex items-center gap-2">
                                        <Sparkles
                                            className="h-3.5 w-3.5 text-brass/70"
                                            strokeWidth={1.75}
                                        />

                                        {streamText ? (
                                            <div className="min-w-0 text-slate-950">
                                                <AnswerText text={streamText} />
                                            </div>
                                        ) : (
                                            <span className="text-sm text-gray-500">
                                                L’assistant est en train d’écrire…
                                                <span className="ml-2 ai-typing-dots align-middle" aria-label="L’assistant écrit">
                                                    <span></span><span></span><span></span>
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Message d'erreur */}
                {error && (
                    <div className="flex justify-start">
                        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    </div>
                )}
            </div>

            {/* Zone de saisie */}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                }}
                className={
                    fullscreen
                        ? "mx-auto mt-4 flex w-full max-w-2xl gap-2"
                        : "mt-4 flex gap-2"
                }
            >
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Poser une question sur ce document…"
                    disabled={loading}
                    className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                />

                {/* Bouton Envoyer */}
                <button
                    type="submit"
                    disabled={loading || !question.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-600 "
                >
                    <Send className="h-3.5 w-3.5" strokeWidth={1.75} />

                    {loading ? "…" : "Envoyer"}
                </button>
            </form>
        </div>
    );
}
