import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { api } from "../lib/api";

export default function PasswordSetupPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const token = params.get("token") || "";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function loadAccount() {
            if (!token) {
                setLoading(false);
                setError("Lien invalide : le token est absent.");
                return;
            }

            try {
                const data = await api.getSetupAccount(token);

                if (!cancelled) {
                    setEmail(data.email || "");
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setLoading(false);
                    setError(
                        err?.data?.message ||
                            err?.message ||
                            "Lien invalide ou expiré.",
                    );
                }
            }
        }

        loadAccount();

        return () => {
            cancelled = true;
        };
    }, [token]);

    async function submit(event) {
        event.preventDefault();

        setError("");
        setMessage("");

        if (!token) {
            setError("Lien invalide : le token est absent.");
            return;
        }

        if (!email) {
            setError("Adresse e-mail introuvable.");
            return;
        }

        if (password.length < 8) {
            setError("Le mot de passe doit contenir au moins 8 caractères.");
            return;
        }

        if (password !== passwordConfirmation) {
            setError("Les deux mots de passe ne correspondent pas.");
            return;
        }

        setSubmitting(true);

        try {
            await api.setupPassword(token, {
                email,
                password,
                password_confirmation: passwordConfirmation,
            });

            setMessage(
                "Votre mot de passe et votre e-mail ont été ajoutés avec succès.",
            );

            setTimeout(() => {
                navigate("/connexion");
            }, 1500);
        } catch (err) {
            setError(
                err?.data?.message ||
                    err?.data?.errors?.password?.[0] ||
                    err?.message ||
                    "Une erreur est survenue.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="mx-auto max-w-lg px-4 py-12">
                <div className="modern-card p-7 text-center">
                    <p className="text-sm text-slate-500">
                        Vérification de votre lien...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-lg px-4 py-8">
            <form
                onSubmit={submit}
                className="modern-card w-full space-y-5 p-5 sm:p-7"
            >
                <div>
                    <h1 className="font-display text-2xl font-extrabold">
                        Créer votre mot de passe
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        Votre compte a été validé. Choisissez maintenant votre
                        mot de passe.
                    </p>
                </div>

                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                        {message}
                    </div>
                )}

                <div>
                    <label className="mb-1 block text-sm font-medium">
                        Adresse e-mail
                    </label>

                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Adresse e-mail"
                        className="w-full rounded-xl"
                        autoComplete="email"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium">
                        Mot de passe
                    </label>

                    <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Mot de passe"
                        className="w-full rounded-xl"
                        autoComplete="new-password"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium">
                        Confirmer le mot de passe
                    </label>

                    <input
                        type="password"
                        required
                        minLength={8}
                        value={passwordConfirmation}
                        onChange={(event) =>
                            setPasswordConfirmation(event.target.value)
                        }
                        placeholder="Confirmer le mot de passe"
                        className="w-full rounded-xl"
                        autoComplete="new-password"
                    />
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary flex w-full items-center justify-center gap-2"
                >
                    <Lock className="h-4 w-4" />

                    {submitting
                        ? "Création en cours..."
                        : "Créer mon mot de passe"}
                </button>
            </form>
        </div>
    );
}
