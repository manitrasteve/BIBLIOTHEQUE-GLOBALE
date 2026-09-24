import { useEffect, useState } from "react";
import { BookOpen, Eye, Heart, LayoutDashboard, LibraryBig, Mail, Palette, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { THEME_PREVIEW_MESSAGE, THEME_PREVIEW_READY, THEME_PREVIEW_STORAGE } from "../../lib/theme";
import StatCard from "../../components/StatCard";
import StatusBadge from "../../components/StatusBadge";
import DocumentCard from "../../components/DocumentCard";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";

const SAMPLE_DOCUMENTS = [
    { slug: "apercu-1", title: "Introduction au droit des affaires", type: "Livre", authors: ["Jean Rakoto"], year: 2024, niveau: "L3", language: "fr", access_level: "public" },
    { slug: "apercu-2", title: "Étude des courants marins", type: "Mémoire", authors: ["Marie Rasoanaivo"], year: 2023, niveau: "M2", language: "mg", access_level: "authentifie" },
    { slug: "apercu-3", title: "Gestion financière appliquée", type: "Thèse", authors: ["Paul Andriamalala"], year: 2022, language: "en", access_level: "restreint" },
];

const NAV = [
    { label: "Tableau de bord", icon: LayoutDashboard, active: true },
    { label: "Catalogue", icon: LibraryBig },
    { label: "Mes favoris", icon: Heart },
    { label: "Messages", icon: Mail },
];

/**
 * Aperçu du thème (administrateur) : éléments représentatifs du site rendus avec les vrais
 * composants. Les couleurs arrivent par postMessage depuis l'éditeur (iframe) ou, en plein écran,
 * depuis la dernière saisie de l'éditeur ; rien n'est publié et le thème public n'est pas touché.
 */
export default function ThemePreviewPage() {
    const standalone = window.parent === window;
    const [mode, setMode] = useState(null);

    // Applique un CSS d'aperçu et le mode clair / sombre à cette page uniquement.
    function apply(css, nextMode) {
        document.getElementById("site-theme")?.setAttribute("media", "not all"); // neutralise le thème publié
        let style = document.getElementById("site-theme-preview");
        if (!style) {
            style = document.createElement("style");
            style.id = "site-theme-preview";
            document.head.appendChild(style);
        }
        style.textContent = css || "";
        if (nextMode) {
            document.documentElement.classList.toggle("dark", nextMode === "dark");
            setMode(nextMode);
        }
    }

    useEffect(() => {
        const originalDark = document.documentElement.classList.contains("dark");

        function onMessage(event) {
            if (event.origin === window.location.origin && event.data?.type === THEME_PREVIEW_MESSAGE) {
                apply(event.data.css, event.data.mode);
            }
        }
        window.addEventListener("message", onMessage);

        if (standalone) {
            // Onglet plein écran : couleurs saisies dans l'éditeur (validées par le serveur avant application).
            try {
                const saved = JSON.parse(localStorage.getItem(THEME_PREVIEW_STORAGE) || "null");
                if (saved?.colors) {
                    api.previewTheme(saved.colors).then(({ css }) => apply(css, saved.mode || "light")).catch(() => {});
                }
            } catch {
                /* aperçu sans couleurs personnalisées */
            }
        } else {
            window.parent.postMessage({ type: THEME_PREVIEW_READY }, window.location.origin);
        }

        return () => {
            window.removeEventListener("message", onMessage);
            document.getElementById("site-theme-preview")?.remove();
            document.getElementById("site-theme")?.removeAttribute("media");
            document.documentElement.classList.toggle("dark", originalDark);
        };
    }, []);

    function switchMode(nextMode) {
        document.documentElement.classList.toggle("dark", nextMode === "dark");
        setMode(nextMode);
        try {
            const saved = JSON.parse(localStorage.getItem(THEME_PREVIEW_STORAGE) || "{}");
            localStorage.setItem(THEME_PREVIEW_STORAGE, JSON.stringify({ ...saved, mode: nextMode }));
        } catch {
            /* ignoré */
        }
    }

    return (
        <div className="bg-canvas">
            <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
                <span className="inline-flex items-center gap-1.5">
                    <Palette className="h-4 w-4" aria-hidden="true" />
                    Aperçu du thème — non publié, visible uniquement par vous
                </span>
                {standalone && (
                    <span className="flex rounded-lg border border-amber-200 bg-surface p-0.5">
                        {[["light", "Clair"], ["dark", "Sombre"]].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => switchMode(value)}
                                aria-pressed={mode === value}
                                className={`rounded-md px-2.5 py-1 ${mode === value ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                            >
                                {label}
                            </button>
                        ))}
                    </span>
                )}
            </div>

            <div className="flex">
                {/* Élément de navigation : mêmes classes que la barre latérale des espaces connectés. */}
                <nav aria-label="Navigation (aperçu)" className="hidden w-56 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-2.5 md:flex">
                    {NAV.map(({ label, icon: Icon, active }) => (
                        <span
                            key={label}
                            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
                                active ? "bg-indigo-600 font-bold text-white" : "text-slate-600 hover:bg-indigo-50 hover:text-brass-deep"
                            }`}
                        >
                            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            {label}
                        </span>
                    ))}
                </nav>

                <div className="min-w-0 flex-1 space-y-5 p-4 sm:p-6">
                    <div>
                        <p className="section-label">Espace membre</p>
                        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Ma bibliothèque numérique</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Texte secondaire : consultez vos lectures et <a href="#" onClick={(e) => e.preventDefault()} className="font-semibold text-brass hover:text-brass-deep">un lien</a>.
                        </p>
                    </div>

                    <section className="hero-glow p-5 sm:p-7">
                        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <span className="badge-modern bg-white/10 text-white/85 ring-1 ring-white/15">Étudiant</span>
                                <p className="mt-3 font-display text-xl font-extrabold">Bonjour, Steve</p>
                                <p className="mt-1 text-sm text-white/85">Bandeau d'en-tête sur la couleur principale.</p>
                            </div>
                            <span className="btn-primary !bg-[#ffffff] !text-indigo-700">Parcourir le catalogue</span>
                        </div>
                    </section>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatCard icon={Eye} label="Documents consultés" value={12} hint="Carte de statistique" />
                        <StatCard icon={Sparkles} label="Questions à l'IA" value={4} tone="success" />
                        <StatCard icon={BookOpen} label="En attente" value={2} tone="warning" />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="modern-card space-y-3 p-4">
                            <p className="font-bold text-slate-900">Formulaire</p>
                            <label className="block text-sm text-ink-soft">
                                Titre
                                <Input className="mt-1" defaultValue="Laravel avancé" />
                            </label>
                            <label className="block text-sm text-ink-soft">
                                Catégorie
                                <Select className="mt-1" defaultValue="Informatique">
                                    <option>Informatique</option>
                                    <option>Droit</option>
                                </Select>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn-primary">Bouton principal</button>
                                <button type="button" className="btn-secondary">Bouton secondaire</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button>Défaut</Button>
                                <Button variant="secondary">Secondaire</Button>
                                <Button variant="outline">Contour</Button>
                                <Button variant="ghost">Discret</Button>
                                <Button variant="destructive">Supprimer</Button>
                                <Button variant="link">Lien</Button>
                            </div>
                        </div>

                        <div className="modern-card space-y-3 p-4">
                            <p className="font-bold text-slate-900">Badges et messages</p>
                            <div className="flex flex-wrap gap-2">
                                <StatusBadge status="publie" />
                                <StatusBadge status="brouillon" />
                                <StatusBadge status="en_attente" />
                                <StatusBadge status="rejetee" />
                                <Badge>Badge</Badge>
                                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-brass">Puce d'accent</span>
                            </div>
                            <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">Message de succès.</p>
                            <p className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">Message d'erreur.</p>
                            <div className="overflow-hidden rounded-xl border border-slate-200">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-3 py-2">Utilisateur</th>
                                            <th className="px-3 py-2">Rôle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[["Steve Rakoto", "Étudiant"], ["Marie Rasoa", "Enseignant"]].map(([name, role]) => (
                                            <tr key={name} className="border-t border-slate-100">
                                                <td className="px-3 py-2 text-slate-900">{name}</td>
                                                <td className="px-3 py-2 text-slate-500">{role}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div>
                        <p className="section-label">Catalogue</p>
                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {SAMPLE_DOCUMENTS.map((doc) => (
                                <div key={doc.slug} onClickCapture={(e) => e.preventDefault()}>
                                    <DocumentCard document={doc} variant="grid" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
