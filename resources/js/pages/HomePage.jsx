import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Search,
    Sparkles,
    ShieldCheck,
    LibraryBig,
    BookOpen,
    UserPlus,
} from "lucide-react";
import { api } from "../lib/api";
import SearchBar from "../components/SearchBar";
import DocumentCard from "../components/DocumentCard";
import { useAuth } from "../context/AuthContext";

export default function HomePage() {
    const { user, isLoggingOut } = useAuth();

    const [recent, setRecent] = useState([]);
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        api.searchDocuments({})
            .then((r) => setRecent((r.data || []).slice(0, 6)))
            .catch(() => {});

        api.getCategories()
            .then(setCategories)
            .catch(() => {});
    }, []);

    return (
        <div>
            <section className="w-full px-4 pt-6 sm:px-8 xl:px-10">
                <div className="grid overflow-hidden rounded-[30px] bg-indigo-600  lg:grid-cols-[1.05fr_.95fr]">
                    <div className="flex flex-col justify-center p-7 text-white sm:p-10 lg:p-12">
                        <span className="badge-modern w-fit bg-white text-indigo-700">
                            <LibraryBig className="h-3.5 w-3.5" />
                            Bibliothèque Globale · Université de Mahajanga
                        </span>
                        <h1 className="mt-6 font-display text-2xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl">
                            Lire, rechercher et <span className="text-indigo-100">analyser</span> vos ressources.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-7 text-indigo-50 sm:text-lg">
                            Une bibliothèque numérique centralisée pour consulter en ligne les livres, mémoires, thèses et autres documents, puis interroger chaque document avec l'assistant IA.
                        </p>
                        <div className="mt-7 max-w-2xl rounded-2xl bg-white p-2">
                            <SearchBar />
                        </div>
                        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-indigo-50">
                            <span className="inline-flex items-center gap-1.5"><Search className="h-4 w-4" /> Recherche</span>
                            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Analyse IA</span>
                            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Consultation sécurisée</span>
                        </div>
                    </div>
                    <div className="relative hidden min-h-[430px] bg-white lg:block">
                        <img src="/images/hero-student.png" alt="Étudiant consultant la bibliothèque numérique" className="h-full w-full object-cover object-center" />
                    </div>
                </div>
            </section>

            {categories.length > 0 && (
                <section className="w-full px-4 sm:px-8 xl:px-10 py-10">
                    <div className="flex items-end justify-between gap-4 mb-5">
                        <div>
                            <p className="section-label">
                                <BookOpen className="h-3.5 w-3.5" />
                                Domaines
                            </p>
                            <h2 className="mt-1 font-display text-2xl sm:text-2xl font-extrabold">
                                Les domaines représentés
                            </h2>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {categories.map((c) => (
                            <Link
                                key={c.id}
                                to={`/recherche?category_id=${c.id}`}
                                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 hover:"
                            >
                                {c.name}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {recent.length > 0 && (
                <section className="w-full px-4 sm:px-8 xl:px-10 py-6">
                    <div className="mb-6 flex items-end justify-between gap-4">
                        <div>
                            <p className="section-label">
                                <Sparkles className="h-3.5 w-3.5" />
                                Bibliothèque Globale
                            </p>
                            <h2 className="mt-1 font-display text-2xl sm:text-2xl font-extrabold">
                                Dernières publications
                            </h2>
                        </div>

                        <Link
                            to="/recherche"
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 transition hover:text-indigo-700"
                        >
                            Tout le catalogue
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                        {recent.map((doc) => (
                            <DocumentCard
                                key={doc.slug}
                                document={doc}
                                showCategory
                                isLocked={isLoggingOut}
                            />
                        ))}
                    </div>
                </section>
            )}

            {!user && (
                <section className="w-full px-4 sm:px-8 xl:px-10 py-8 sm:py-10">
                    <div className="modern-card p-7 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-7">
                        <div>
                            <p className="section-label">
                                <UserPlus className="h-3.5 w-3.5" />
                                Accès membre
                            </p>
                            <h2 className="mt-2 font-display text-2xl sm:text-2xl font-extrabold">
                                S’inscrire
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                                La demande est examinée par le Service Numérique
                                puis validée par l'administrateur.
                            </p>
                        </div>

                        <Link
                            to="/creer-un-compte"
                            className="btn-primary shrink-0"
                        >
                            S’inscrire
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            )}
        </div>
    );
}
