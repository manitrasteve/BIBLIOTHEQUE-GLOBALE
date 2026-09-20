import { useState } from "react";
import { CheckCircle2, AlertCircle, Ban } from "lucide-react";
import { api } from "../lib/api";

const SUCCESS_MESSAGE =
    "Un lien de réinitialisation de votre mot de passe a été envoyé à cette adresse e-mail.";
const NOT_FOUND_MESSAGE = "Cette adresse e-mail n’a pas de compte.";
const DISABLED_MESSAGE = "Votre compte est désactivé.";

// Transforme la réponse de l'API en message affichable.
function feedbackFromError(err) {
    if (err?.status === 404) return { type: "not_found", text: NOT_FOUND_MESSAGE };
    if (err?.status === 403) return { type: "disabled", text: DISABLED_MESSAGE };
    if (err?.status === 429) {
        return {
            type: "error",
            text: "Trop de tentatives. Veuillez patienter une minute avant de réessayer.",
        };
    }

    return {
        type: "error",
        text: err?.data?.message || "Impossible de traiter la demande pour le moment.",
    };
}

const FEEDBACK_STYLES = {
    success: {
        box: "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold",
        Icon: CheckCircle2,
    },
    not_found: { box: "border-rose-200 bg-rose-50 text-rose-700 font-semibold", Icon: AlertCircle },
    disabled: { box: "border-rose-200 bg-rose-50 text-rose-700 font-semibold", Icon: Ban },
    error: { box: "border-rose-200 bg-rose-50 text-rose-700", Icon: AlertCircle },
};

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [feedback, setFeedback] = useState(null);
    const [loading, setLoading] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setFeedback(null);
        setLoading(true);

        try {
            const response = await api.forgotPassword(email.trim());
            setFeedback({ type: "success", text: response?.message || SUCCESS_MESSAGE });
        } catch (err) {
            setFeedback(feedbackFromError(err));
        } finally {
            setLoading(false);
        }
    }

    const style = feedback ? FEEDBACK_STYLES[feedback.type] : null;

    return (
        <div className="mx-auto max-w-lg px-4 py-8">
            <form
                onSubmit={submit}
                className="modern-card space-y-5 p-5 sm:p-7"
            >
                <h1 className="font-display text-2xl font-extrabold">
                    Mot de passe oublié ?
                </h1>

                <p className="text-sm text-slate-500">
                    Entrez votre e-mail pour recevoir un lien sécurisé valable
                    pendant 60 minutes.
                </p>

                {feedback && (
                    <div
                        role={feedback.type === "success" ? "status" : "alert"}
                        className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${style.box}`}
                    >
                        <style.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">{feedback.text}</span>
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
