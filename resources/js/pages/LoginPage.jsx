import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthField from "../components/AuthField";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const connectedUser = await login(email, password);

            if (connectedUser.role === "administrateur") {
                navigate("/administrateur/statistiques", { replace: true });
            } else if (connectedUser.role === "bibliothecaire") {
                navigate("/bibliothecaire/tableau-de-bord", { replace: true });
            } else {
                navigate("/tableau-de-bord", { replace: true });
            }
        } catch (err) {
            setError(
                err.status === 422
                    ? err.data?.errors?.email?.[0] || "Identifiants incorrects."
                    : err.status === 429
                      ? err.data?.message || "Trop de tentatives. Réessayez dans une minute."
                      : "Connexion impossible pour le moment.",
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto grid max-w-[1000px] gap-6 px-4 sm:px-6 py-10 lg:grid-cols-[.85fr_1fr] lg:items-stretch">
            <div className="hero-banner hidden p-9 lg:flex lg:flex-col lg:justify-between">
                <div className="relative z-10">
                    {/* bg-[#ffffff] : pastille toujours blanche (le logo bleu reste visible sur le fond bleu et en mode sombre) */}
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ffffff] p-1.5">
                        <img
                            src="/images/logo-universite-mahajanga.png"
                            alt="Université de Mahajanga"
                            className="h-full w-full object-contain"
                        />
                    </span>
                    <h1 className="mt-7 font-display text-2xl font-extrabold leading-tight">
                        Bienvenue dans votre espace documentaire.
                    </h1>
                    <p className="mt-4 text-sm leading-6 text-on-primary-soft">
                        Retrouvez vos consultations et votre assistant IA depuis
                        un seul tableau de bord.
                    </p>
                </div>
                <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-on-primary-soft">
                    <ShieldCheck className="h-4 w-4 text-on-primary-soft" />{" "}
                    Plateforme sécurisée
                </div>
            </div>

            <div className="modern-card p-4 sm:p-5">
                <p className="section-label">
                    <Lock className="h-3.5 w-3.5" /> Accès membre
                </p>
                <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">
                    Connexion
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                    Connectez-vous pour accéder à vos services personnalisés.
                </p>

                <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                    <AuthField
                        label="Adresse e-mail"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.com"
                    />
                    <AuthField
                        label="Mot de passe"
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Votre mot de passe"
                    />
                    {error && (
                        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                            {error}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? "Connexion…" : "Se connecter"}{" "}
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <Link
                        to="/mot-de-passe-oublie"
                        className="text-sm font-bold text-blue-700 hover:underline"
                    >
                        Mot de passe oublié ?
                    </Link>
                </div>
                <p className="mt-6 text-center text-sm text-slate-700">
                    Pas encore de compte ?{" "}
                    <Link
                        to="/creer-un-compte"
                        className="font-bold text-blue-700 hover:underline"
                    >
                        Créer un compte
                    </Link>
                </p>
            </div>
        </div>
    );
}
