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
        <div className="relative">
            {/* Bandeau bleu nuit (couleur pleine) derrière le haut de la carte. */}
            <div className="absolute inset-x-0 top-0 h-40 bg-umg-night sm:h-44" aria-hidden="true" />

            <div className="relative mx-auto w-full max-w-xl px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
                {/* Identité : pastille blanche du logo + nom de la bibliothèque, sur le bandeau. */}
                <div className="mb-4 flex items-center justify-center gap-3 text-[#ffffff]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ffffff] p-1">
                        <img src="/images/logo-universite-mahajanga.png" alt="" className="h-full w-full object-contain" />
                    </span>
                    <span className="leading-tight">
                        <span className="block font-display text-lg font-bold">Bibliothèque Globale</span>
                        <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-on-primary-soft">
                            Université de Mahajanga
                        </span>
                    </span>
                </div>

                <div className="overflow-hidden rounded-lg border border-line border-t-4 border-t-gold bg-surface">
                    <div className="px-5 py-5 sm:px-10 sm:py-5">
                        <p className="section-label">
                            <Lock className="h-3.5 w-3.5" /> Accès membre
                        </p>
                        <h1 className="mt-2 font-display text-[26px] font-extrabold tracking-tight text-ink">Connexion</h1>
                        <p className="mt-1.5 text-sm text-ink-soft">Connectez-vous pour accéder à vos services personnalisés.</p>

                        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                            <AuthField
                                label="Adresse e-mail"
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="vous@exemple.com"
                            />
                            <div>
                                <AuthField
                                    label="Mot de passe"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Votre mot de passe"
                                />
                                <div className="mt-1.5 text-right">
                                    <Link to="/mot-de-passe-oublie" className="text-sm font-bold text-blue-700 hover:underline">
                                        Mot de passe oublié ?
                                    </Link>
                                </div>
                            </div>
                            {error && (
                                <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                                    {error}
                                </p>
                            )}
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full !py-3 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? "Connexion…" : "Se connecter"} <ArrowRight className="h-4 w-4" />
                            </button>
                        </form>
                    </div>

                    {/* Pied de carte : création de compte. */}
                    <p className="border-t border-line bg-paper px-5 py-3 text-center text-sm text-slate-700 sm:px-10">
                        Pas encore de compte ?{" "}
                        <Link to="/creer-un-compte" className="font-bold text-blue-700 hover:underline">
                            Créer un compte
                        </Link>
                    </p>
                </div>

                <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-soft">
                    <ShieldCheck className="h-4 w-4 text-brass" aria-hidden="true" />
                    Connexion sécurisée · Service Numérique de l'Université
                </p>
            </div>
        </div>
    );
}