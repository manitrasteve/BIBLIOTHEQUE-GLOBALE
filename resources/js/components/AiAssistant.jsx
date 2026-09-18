import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, BookText } from "lucide-react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";

const SUGGESTIONS = [
    "Résume ce document.",
    "Quels sont les points importants ?",
    "Explique cette partie.",
];

export default function AiAssistant({ slug }) {
    const [question, setQuestion] = useState("");
    const [exchanges, setExchanges] = useState(() => sessionMemory.getAiChat(slug));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);
    const scrollRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [exchanges.length]);

    async function ask(q) {
        const finalQuestion = q ?? question;

        if (!finalQuestion.trim() || loading) return;

        setLoading(true);
        setError(null);
        setQuestion("");

        try {
            const result = await api.askAi(slug, finalQuestion);

            const next = [
                ...sessionMemory.getAiChat(slug),
                {
                    question: finalQuestion,
                    answer: result.answer,
                    sources: result.sources || [],
                },
            ];
            sessionMemory.setAiChat(slug, next);
            if (mountedRef.current) setExchanges(next);
        } catch (err) {
            if (mountedRef.current)
                setError("L'assistant n'a pas pu répondre pour le moment.");
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }

    return (
        <div className="rounded-xl border border-line bg-paper-dim/40 p-5 flex flex-col h-[80vh]">
            {/* En-tête */}
            <div className="mb-4">
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

            {/* Zone des conversations */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-2">
                {/* Suggestions */}
                {exchanges.length === 0 && (
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
                                    <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
                                        <p className="text-sm whitespace-pre-wrap">
                                            {ex.question}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Réponse de l'IA */}
                            <div className="flex justify-start">
                                <div className="max-w-[85%] w-fit">
                                    <div className="bg-white text-black border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600">
                                        {/* Icône IA */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles
                                                className="h-3.5 w-3.5 text-brass/70"
                                                strokeWidth={1.75}
                                            />

                                            <span className="text-xs font-medium text-gray-600 dark:text-slate-400">
                                                Assistant IA
                                            </span>
                                        </div>

                                        {/* Texte de la réponse */}
                                        <p className="text-sm text-black whitespace-pre-wrap leading-relaxed dark:text-slate-100">
                                            {ex.answer}
                                        </p>
                                    </div>

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

                {/* Chargement */}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm dark:bg-slate-800 dark:border-slate-600">
                            <div className="flex items-center gap-2">
                                <Sparkles
                                    className="h-3.5 w-3.5 text-brass/70"
                                    strokeWidth={1.75}
                                />

                                <span className="text-sm text-gray-500 dark:text-slate-400">
                                    L’assistant est en train d’écrire…
                                    <span className="ml-2 ai-typing-dots align-middle" aria-label="L’assistant écrit">
                                        <span></span><span></span><span></span>
                                    </span>
                                </span>
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
                className="mt-4 flex gap-2"
            >
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Poser une question sur ce document…"
                    disabled={loading}
                    className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
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
