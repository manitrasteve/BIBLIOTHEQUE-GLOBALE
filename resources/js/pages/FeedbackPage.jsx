import { useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import { api } from "../lib/api";

const initialForm = {
    type: "general",
    subject: "",
    message: "",
    rating: 5,
};

export default function FeedbackPage() {
    const [form, setForm] = useState(initialForm);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    function update(field, value) {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    }

    async function submit(event) {
        event.preventDefault();
        setError(null);
        setSent(false);
        setSubmitting(true);

        try {
            await api.createFeedback({
                type: form.type,
                subject: form.subject.trim(),
                message: form.message.trim(),
                rating: Number(form.rating),
            });

            setForm(initialForm);
            setSent(true);
        } catch (err) {
            const errors = err?.data?.errors;

            setError(
                errors
                    ? Object.values(errors)?.[0]?.[0]
                    : err?.data?.message || "Envoi impossible.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="w-full">
            <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-extrabold">
                <MessageSquare className="h-5 w-5 text-indigo-600" />
                Avis & Suggestions
            </h2>

            {sent && (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                    Merci ! Votre avis a bien été enregistré et transmis à
                    l'administration.
                </div>
            )}

            {error && (
                <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <form
                onSubmit={submit}
                className="modern-card space-y-5 p-6"
            >
                <select
                    value={form.type}
                    onChange={(event) => update("type", event.target.value)}
                    className="w-full rounded-xl"
                >
                    <option value="general">Opinion générale</option>
                    <option value="suggestion">Suggestion</option>
                    <option value="bug">Bug</option>
                    <option value="document">Problème document</option>
                    <option value="ai">Problème IA</option>
                    <option value="autre">Autre</option>
                </select>

                <input
                    required
                    placeholder="Sujet"
                    value={form.subject}
                    onChange={(event) => update("subject", event.target.value)}
                    className="w-full rounded-xl"
                    maxLength={255}
                />

                <textarea
                    required
                    rows={6}
                    placeholder="Votre message"
                    value={form.message}
                    onChange={(event) => update("message", event.target.value)}
                    className="w-full rounded-xl"
                    maxLength={5000}
                />

                <div>
                    <p className="mb-2 text-sm font-bold">
                        Votre satisfaction
                    </p>

                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((number) => (
                            <button
                                type="button"
                                key={number}
                                onClick={() => update("rating", number)}
                                aria-label={`${number} étoile${number > 1 ? "s" : ""}`}
                            >
                                <Star
                                    className={`h-6 w-6 ${
                                        number <= form.rating
                                            ? "fill-current text-amber-500"
                                            : "text-slate-300"
                                    }`}
                                />
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting ? "Envoi en cours…" : "Envoyer mon avis"}
                </button>
            </form>
        </div>
    );
}
