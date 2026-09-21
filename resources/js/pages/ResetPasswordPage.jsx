import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function ResetPasswordPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const token = params.get("token") || "";
    const email = params.get("email") || "";
    // Lien envoyé à la création (ou réactivation) d'un compte : mêmes champs, mais vocabulaire « créer » et non « réinitialiser ».
    const creation = params.get("type") === "creation";

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState(null);
    const [ok, setOk] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError(null);

        if (!token || !email) {
            setError(creation ? "Ce lien de création de mot de passe est incomplet." : "Ce lien de réinitialisation est incomplet.");
            return;
        }

        if (password.length < 8) {
            setError("Le mot de passe doit contenir au moins 8 caractères.");
            return;
        }

        if (password !== confirm) {
            setError("Les deux mots de passe ne correspondent pas.");
            return;
        }

        setSubmitting(true);

        try {
            await api.resetPassword({
                email,
                token,
                password,
                password_confirmation: confirm,
            });

            setOk(true);

            setTimeout(() => {
                navigate("/connexion");
            }, 1500);
        } catch (err) {
            setError(
                err?.data?.message ||
                    err?.data?.errors?.password?.[0] ||
                    "Lien invalide ou expiré.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="mx-auto max-w-lg px-4 py-8">
            <form
                onSubmit={submit}
                className="modern-card space-y-5 p-7"
            >
                <h1 className="font-display text-2xl font-extrabold">
                    {creation ? "Créer votre mot de passe" : "Réinitialiser le mot de passe"}
                </h1>

                <p className="text-sm text-slate-500">
                    {creation
                        ? "Votre compte a été créé. Choisissez maintenant votre mot de passe."
                        : "Choisissez un nouveau mot de passe pour votre compte."}
                </p>

                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {ok && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                        {creation ? "Mot de passe créé avec succès." : "Mot de passe réinitialisé avec succès."} Redirection vers
                        la connexion…
                    </div>
                )}

                <input
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl"
                    placeholder="Nouveau mot de passe"
                    autoComplete="new-password"
                />

                <input
                    type="password"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    className="w-full rounded-xl"
                    placeholder="Confirmer"
                    autoComplete="new-password"
                />

                <button
                    type="submit"
                    disabled={submitting || ok}
                    className="btn-primary w-full disabled:opacity-50"
                >
                    {submitting ? "Enregistrement…" : creation ? "Créer mon mot de passe" : "Enregistrer"}
                </button>
            </form>
        </div>
    );
}
