import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Sparkles, Send, RotateCcw, Database } from "lucide-react";

// Markdown chargé à la demande, comme dans l'assistant de lecture.
const AiMarkdown = lazy(() => import("./AiMarkdown"));

const MAX_QUESTION = 1000;
const HISTORY_SENT = 6;

function AnswerText({ text }) {
    return (
        <Suspense fallback={<p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>}>
            <AiMarkdown>{text}</AiMarkdown>
        </Suspense>
    );
}

function describeCriteria(criteres) {
    return Object.entries(criteres ?? {})
        .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
        .map(([k, v]) => `${k.replaceAll("_", " ")} : ${v}`)
        .join(" · ");
}

function noteFor(source) {
    if (source.erreur) return "critère refusé";
    if (source.hors_perimetre) return "hors périmètre";
    if (source.trouve === false || source.total === 0) return "aucun résultat";
    if (typeof source.total === "number") return `${source.total} résultat${source.total > 1 ? "s" : ""}`;
    return null;
}

function Sources({ sources }) {
    if (!sources?.length) return null;

    return (
        <details className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">
            <summary className="flex cursor-pointer items-center gap-1.5">
                <Database className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Données consultées ({sources.length})
            </summary>
            <ul className="mt-2 space-y-1">
                {sources.map((s, i) => {
                    const criteria = describeCriteria(s.criteres);
                    const note = noteFor(s);

                    return (
                        <li key={i} className="break-words">
                            <span className="font-medium text-ink">{s.libelle}</span>
                            {criteria && <span> — {criteria}</span>}
                            {note && <span> — {note}</span>}
                        </li>
                    );
                })}
            </ul>
        </details>
    );
}

/**
 * Chat de l'assistant de gestion. Le serveur impose le périmètre : ce composant n'envoie
 * que la question et un court historique texte (mémoire en RAM, perdue au rechargement).
 */
export default function ManagementAssistantChat({ ask, memory, setMemory, examples, placeholder }) {
    const [messages, setMessages] = useState(() => memory());
    const [question, setQuestion] = useState("");
    const [loading, setLoading] = useState(false);
    const endRef = useRef(null);
    const inputRef = useRef(null);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [messages, loading]);

    function commit(next) {
        setMessages(next);
        setMemory(next);
    }

    async function send(text) {
        const q = (text ?? question).trim();
        if (!q || loading) return;

        const history = messages
            .filter((m) => !m.error)
            .slice(-HISTORY_SENT)
            .map((m) => ({ role: m.role, text: m.text }));

        const withQuestion = [...messages, { role: "user", text: q }];
        commit(withQuestion);
        setQuestion("");
        setLoading(true);

        let reply;
        try {
            const res = await ask(q, history);
            reply = { role: "model", text: res.answer, sources: res.sources, error: res.ok === false };
        } catch (e) {
            const text =
                e.status === 403
                    ? "Vous n'avez pas accès à cet assistant."
                    : e.status === 429
                      ? "Trop de questions en peu de temps. Patientez une minute puis réessayez."
                      : e.status === 422
                        ? "Question invalide : elle doit contenir entre 1 et 1000 caractères."
                        : "Impossible de joindre l'assistant. Vérifiez votre connexion et réessayez.";
            reply = { role: "model", text, error: true };
        }

        if (!alive.current) {
            // L'utilisateur a changé de page : on conserve tout de même la réponse en mémoire.
            setMemory([...withQuestion, reply]);
            return;
        }
        commit([...withQuestion, reply]);
        setLoading(false);
        inputRef.current?.focus();
    }

    function reset() {
        if (loading) return;
        commit([]);
        setQuestion("");
    }

    return (
        <div className="flex flex-col">
            {messages.length > 0 && (
                <div className="mb-3 flex justify-end">
                    <button type="button" className="btn-secondary" onClick={reset} disabled={loading}>
                        <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        Nouvelle conversation
                    </button>
                </div>
            )}

            <div
                className="min-h-[16rem] space-y-4 rounded-xl border border-line bg-paper-dim p-3 sm:p-4"
                role="log"
                aria-live="polite"
                aria-label="Conversation avec l'assistant"
            >
                {messages.length === 0 && !loading && (
                    <div className="py-6 text-center">
                        <Sparkles className="mx-auto h-8 w-8 text-brass" strokeWidth={1.5} aria-hidden="true" />
                        <p className="mt-3 text-sm font-medium text-ink">Posez une question de gestion</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {examples.map((ex) => (
                                <button
                                    key={ex}
                                    type="button"
                                    onClick={() => send(ex)}
                                    className="max-w-full rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs text-ink hover:border-brass"
                                >
                                    {ex}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m, i) =>
                    m.role === "user" ? (
                        <div key={i} className="flex justify-end">
                            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm text-white">
                                {m.text}
                            </div>
                        </div>
                    ) : (
                        <div key={i} className="flex justify-start">
                            <div
                                className={`max-w-[92%] break-words rounded-2xl rounded-bl-md border px-4 py-3 text-sm text-slate-950 ${
                                    m.error ? "border-red-300 bg-red-50" : "border-gray-200 bg-surface"
                                }`}
                            >
                                <AnswerText text={m.text} />
                                <Sources sources={m.sources} />
                            </div>
                        </div>
                    ),
                )}

                {loading && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-surface px-4 py-3 text-sm text-ink-soft">
                            Consultation des données…
                            <span className="ml-2 ai-typing-dots align-middle" aria-label="L'assistant écrit">
                                <span></span>
                                <span></span>
                                <span></span>
                            </span>
                            <p className="mt-1 text-xs">Cela peut prendre jusqu'à une minute.</p>
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    send();
                }}
            >
                <textarea
                    ref={inputRef}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    rows={2}
                    maxLength={MAX_QUESTION}
                    disabled={loading}
                    placeholder={placeholder}
                    aria-label="Votre question"
                    className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-950 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
                <button
                    type="submit"
                    disabled={loading || !question.trim()}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                    <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {loading ? "…" : "Envoyer"}
                </button>
            </form>
            <p className="mt-1 text-right text-xs text-ink-soft">
                Entrée pour envoyer · Maj+Entrée pour un retour à la ligne · {question.length}/{MAX_QUESTION}
            </p>
        </div>
    );
}
