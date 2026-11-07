import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { api } from "../lib/api";
import AuthField from "../components/AuthField";
import { trackTopProgress } from "../lib/topProgress";

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
    // Lien refusé à l'ouverture : pas de formulaire, l'envoi échouerait de toute façon.
    const [linkInvalid, setLinkInvalid] = useState(false);
    // Mot de passe créé : le lien est consommé, un second envoi afficherait « Lien invalide ».
    const [done, setDone] = useState(false);
    const redirectTimer = useRef(null);

    useEffect(() => () => clearTimeout(redirectTimer.current), []);

    useEffect(() => {
        let cancelled = false;

        async function loadAccount() {
            if (!token) {
                setLoading(false);
                setLinkInvalid(true);
                setError("Lien invalide : le token est absent.");
                return;
            }

            try {
                const data = await api.getSetupAccount(token);

                if (!cancelled) {
                    // L'e-mail est celui de la demande validée : affiché pour information, non modifiable.
                    setEmail(data.request?.email || data.request?.created_user?.email || "");
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setLoading(false);
                    // Réseau coupé ou trop de tentatives : le lien est peut-être valide, le formulaire reste proposé.
                    if (err?.status === 404 || err?.status === 410) setLinkInvalid(true);
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
            await trackTopProgress(() => api.setupPassword(token, {
                password,
                password_confirmation: passwordConfirmation,
            }));

            setDone(true);
            setMessage(
                "Votre mot de passe a été créé. Votre compte est maintenant actif.",
            );

            redirectTimer.current = setTimeout(() => {
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

    if (linkInvalid) {
        return (
            <div className="mx-auto w-full max-w-lg px-4 py-8">
                <div className="modern-card w-full space-y-4 p-5 sm:p-7">
                    <h1 className="font-display text-2xl font-extrabold">
                        Lien de création indisponible
                    </h1>
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </div>
                    <p className="text-sm text-slate-500">
                        Si votre mot de passe est déjà créé, connectez-vous. Sinon, demandez un nouveau lien au Service Numérique.
                    </p>
                    <Link to="/connexion" className="btn-primary inline-flex justify-center">Aller à la connexion</Link>
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

                {email && (
                    <AuthField
                        label="Adresse e-mail"
                        type="email"
                        value={email}
                        readOnly
                        className="bg-slate-50"
                        autoComplete="username"
                    />
                )}

                <AuthField
                    label="Mot de passe"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="8 caractères minimum"
                    autoComplete="new-password"
                />

                <AuthField
                    label="Confirmer le mot de passe"
                    type="password"
                    required
                    minLength={8}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    placeholder="Retapez le mot de passe"
                    autoComplete="new-password"
                />

                <button
                    type="submit"
                    disabled={submitting || done}
                    className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5 disabled:opacity-50"
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
