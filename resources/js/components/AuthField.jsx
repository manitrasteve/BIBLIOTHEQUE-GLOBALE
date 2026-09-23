import { useId, useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

// Champ des pages d'accès (mot de passe oublié, réinitialisation, création du mot de passe) :
// même présentation que la page de connexion — libellé, icône, hauteur et bordure visibles.
const fieldClass =
    "w-full rounded-xl border border-slate-200 py-3 pl-10 text-sm transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function AuthField({ label, type = "text", className = "", ...props }) {
    const id = useId();
    const [visible, setVisible] = useState(false);
    const isPassword = type === "password";
    const Icon = type === "email" ? Mail : Lock;

    return (
        <div>
            <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-700">
                {label}
            </label>
            <div className="relative">
                <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                    id={id}
                    type={isPassword && visible ? "text" : type}
                    {...props}
                    className={`${fieldClass} ${isPassword ? "pr-11" : "pr-3"} ${className}`}
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setVisible((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        title={visible ? "Masquer" : "Afficher"}
                    >
                        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                )}
            </div>
        </div>
    );
}
