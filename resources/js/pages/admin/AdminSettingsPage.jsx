import { Link } from "react-router-dom";
import { ArrowRight, LayoutTemplate, Settings } from "lucide-react";

// Paramètres de la plateforme (administrateur). Chaque réglage est une carte vers sa page.
const SETTINGS = [
    {
        to: "/administrateur/parametres/page-accueil",
        title: "Modifier la page d'accueil",
        description: "Sections, textes, images, ordre et styles de la page d'accueil publique, avec brouillon, aperçu et historique des versions.",
        icon: LayoutTemplate,
    },
];

export default function AdminSettingsPage() {
    return (
        <div>
            <h2 className="mb-5 flex items-center gap-2 font-display text-xl font-extrabold">
                <Settings className="h-5 w-5 text-indigo-600" />
                Paramètres
            </h2>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {SETTINGS.map(({ to, title, description, icon: Icon }) => (
                    <Link key={to} to={to} className="modern-card group flex flex-col p-5 hover:border-indigo-300">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                            <Icon className="h-5 w-5" />
                        </span>
                        <span className="mt-4 font-display text-lg font-bold text-slate-900">{title}</span>
                        <span className="mt-1 flex-1 text-sm leading-6 text-slate-500">{description}</span>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600">
                            Ouvrir <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
