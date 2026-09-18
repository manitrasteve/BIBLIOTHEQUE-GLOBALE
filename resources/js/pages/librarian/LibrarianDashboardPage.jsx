import {
    Ticket,
    FileText,
    Landmark,
    LayoutDashboard,
    LibraryBig,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function LibrarianDashboardPage() {
    return (
        <div className="space-y-6">
            <section className="hero-glow p-6 sm:p-9">
                <div className="relative z-10">
                    <span className="badge-modern bg-white/10 text-indigo-100 ring-1 ring-white/15">
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        Tableau de bord
                    </span>

                    <h2 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                        Bienvenue dans votre espace de gestion 👋
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">
                        Gérez les demandes de comptes, les documents et
                        consultez le catalogue de la Bibliothèque Numérique.
                    </p>
                </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                    to="/bibliothecaire/tickets-comptes"
                    className="modern-card p-6 transition hover:-translate-y-1"
                >
                    <Ticket className="h-7 w-7 text-indigo-600" />

                    <h3 className="mt-4 font-display text-lg font-extrabold">
                        Demandes de compte
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                        Vérifier et traiter les demandes de création de compte.
                    </p>
                </Link>

                <Link
                    to="/bibliothecaire/documents"
                    className="modern-card p-6 transition hover:-translate-y-1"
                >
                    <FileText className="h-7 w-7 text-indigo-600" />

                    <h3 className="mt-4 font-display text-lg font-extrabold">
                        Documents
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                        Gérer les livres, mémoires et documents numériques.
                    </p>
                </Link>

                <Link
                    to="/bibliothecaire/catalogue"
                    className="modern-card p-6 transition hover:-translate-y-1"
                >
                    <LibraryBig className="h-7 w-7 text-indigo-600" />

                    <h3 className="mt-4 font-display text-lg font-extrabold">
                        Catalogue
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                        Consulter les documents publiés dans la bibliothèque.
                    </p>
                </Link>
            </div>
        </div>
    );
}
