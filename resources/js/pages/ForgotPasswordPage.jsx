import { useState } from "react";
import { api } from "../lib/api";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await api.forgotPassword(email.trim());
            setSent(true);
        } catch (err) {
            setError(
                err?.data?.message ||
                    "Impossible de traiter la demande pour le moment.",
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-lg px-4 py-12">
            <form
                onSubmit={submit}
                className="modern-card space-y-5 p-7"
            >
                <h1 className="font-display text-2xl font-extrabold">
                    Mot de passe oublié ?
                </h1>

                <p className="text-sm text-slate-500">
                    Entrez votre e-mail pour recevoir un lien sécurisé valable
                    pendant 60 minutes.
                </p>

                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {sent && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                        Si cette adresse existe, un lien de réinitialisation a
                        été envoyé.
                    </div>
                )}

                <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl"
                    placeholder="vous@exemple.com"
                    autoComplete="email"
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full disabled:opacity-50"
                >
                    {loading ? "Envoi en cours…" : "Envoyer le lien"}
                </button>
            </form>
        </div>
    );
}
