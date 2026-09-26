import { useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import { api } from "../lib/api";

const labelClass = "block text-sm font-semibold text-slate-700";
const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-900 outline-none focus:border-brass focus:ring-2 focus:ring-indigo-200";

const RATING_LABELS = ["", "Pas du tout satisfait", "Peu satisfait", "Moyennement satisfait", "Satisfait", "Très satisfait"];

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
        setSent(false);
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
                <MessageSquare className="h-5 w-5 text-brass" />
                Avis & Suggestions
            </h2>

            {sent && (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                    Merci ! Votre avis a bien été enregistré et transmis à
                    l'administration.
                </div>
            )}

            {error && (
                <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <form
                onSubmit={submit}
                className="modern-card space-y-5 p-4"
            >
                <label className={labelClass}>
                    Type d'avis *
                    <select
                        value={form.type}
                        onChange={(event) => update("type", event.target.value)}
                        className={inputClass}
                    >
                        <option value="general">Opinion générale</option>
                        <option value="suggestion">Suggestion</option>
                        <option value="bug">Bug</option>
                        <option value="document">Problème document</option>
                        <option value="ai">Problème IA</option>
                        <option value="autre">Autre</option>
                    </select>
                </label>

                <label className={labelClass}>
                    Sujet *
                    <input
                        required
                        placeholder="Ex. : ajouter plus de mémoires en informatique"
                        value={form.subject}
                        onChange={(event) => update("subject", event.target.value)}
                        className={inputClass}
                        maxLength={255}
                    />
                </label>

                <label className={labelClass}>
                    Votre message *
                    <textarea
                        required
                        rows={6}
                        placeholder="Partagez votre avis ou votre suggestion…"
                        value={form.message}
                        onChange={(event) => update("message", event.target.value)}
                        className={inputClass}
                        maxLength={5000}
                    />
                    <span className="mt-1 block text-right text-xs font-normal text-slate-500">
                        {form.message.length} / 5000
                    </span>
                </label>

                <div>
                    <p className={`mb-2 ${labelClass}`}>
                        Votre satisfaction
                    </p>

                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((number) => (
                            <button
                                type="button"
                                key={number}
                                onClick={() => update("rating", number)}
                                aria-label={`${number} étoile${number > 1 ? "s" : ""}`}
                                aria-pressed={number <= form.rating}
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
                        <span className="ml-2 self-center text-sm text-slate-500">
                            {RATING_LABELS[form.rating]}
                        </span>
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
