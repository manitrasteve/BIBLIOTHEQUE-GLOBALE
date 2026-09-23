import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    Mail,
    Lock,
    ArrowRight,
    ShieldCheck,
    Eye,
    EyeOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
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
            <div className="hero-glow hidden p-9 lg:flex lg:flex-col lg:justify-between">
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
                    <p className="mt-4 text-sm leading-6 text-indigo-100">
                        Retrouvez vos consultations et votre assistant IA depuis
                        un seul tableau de bord.
                    </p>
                </div>
                <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-indigo-100">
                    <ShieldCheck className="h-4 w-4 text-indigo-300" />{" "}
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
                    <div>
                        <label
                            htmlFor="email"
                            className="mb-2 block text-sm font-bold text-slate-700"
                        >
                            Adresse e-mail
                        </label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-xl py-3 pl-10 pr-3"
                                placeholder="vous@exemple.com"
                            />
                        </div>
                    </div>
                    <div>
                        <label
                            htmlFor="password"
                            className="mb-2 block text-sm font-bold text-slate-700"
                        >
                            Mot de passe
                        </label>
                        <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-xl py-3 pl-10 pr-11"
                                placeholder="Votre mot de passe"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            >
                                {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    {error && (
                        <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
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
                        className="text-sm font-bold text-indigo-600 hover:text-indigo-400"
                    >
                        Mot de passe oublié ?
                    </Link>
                </div>
                <p className="mt-6 text-center text-sm text-slate-700">
                    Pas encore de compte ?{" "}
                    <Link
                        to="/creer-un-compte"
                        className="font-bold text-indigo-600 hover:text-indigo-400"
                    >
                        Créer un compte
                    </Link>
                </p>
            </div>
        </div>
    );
}
