import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import MonthlyChart from "../../components/charts/MonthlyChart";
import { formatDelay } from "./AdminStatsPage";

// Rapport mensuel au format A4 : « Imprimer / PDF » ouvre l'impression du navigateur
// (« Enregistrer au format PDF »). La barre d'outils et l'en-tête du site ne sont pas imprimés.
const fmt = (value) => new Intl.NumberFormat("fr-FR").format(value ?? 0);

function change(current, previous) {
    if (!previous) return current ? "nouveau" : "—";
    const pct = Math.round(((current - previous) / previous) * 100);
    return pct === 0 ? "stable" : `${pct > 0 ? "+" : ""}${pct} %`;
}

export default function MonthlyReportPage() {
    const [params] = useSearchParams();
    const { user } = useAuth();
    const month = params.get("mois") || undefined;
    const establishment = params.get("etablissement") || undefined;
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [remark, setRemark] = useState("");

    useEffect(() => {
        api.getStatistics({ months: 12, ...(month ? { month } : {}), ...(establishment ? { establishment } : {}) })
            .then(setStats)
            .catch(() => setError("Impossible de générer le rapport pour le moment."));
    }, [month, establishment]);

    // Nom du fichier PDF proposé par le navigateur.
    useEffect(() => {
        if (stats) document.title = `Rapport mensuel ${stats.month_label}${establishment ? ` ${establishment}` : ""} - Bibliothèque Globale`;
        return () => { document.title = "Bibliothèque Globale"; };
    }, [stats, establishment]);

    const back = user?.role === "administrateur" ? "/administrateur/statistiques" : "/bibliothecaire/statistiques";

    if (error) return <p role="alert" className="mx-auto my-10 max-w-xl rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p>;
    if (!stats) return <p className="mx-auto my-10 max-w-xl text-center text-ink-soft">Préparation du rapport…</p>;

    const k = stats.kpis;
    const s = stats.request_statuses;
    const generated = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

    return (
        <div className="report-page bg-paper px-4 py-6 print:bg-white print:p-0">
            {/* Barre d'outils (non imprimée) */}
            <div className="mx-auto mb-4 flex max-w-[794px] flex-wrap items-center justify-between gap-3 print:hidden">
                <Link to={back} className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Retour aux statistiques</Link>
                <button type="button" onClick={() => window.print()} className="btn-primary">
                    <Printer className="h-4 w-4" /> Imprimer / Enregistrer en PDF
                </button>
            </div>

            <article className="mx-auto flex min-h-[1123px] w-full max-w-[794px] flex-col gap-5 bg-white px-14 py-12 text-[#15212b] shadow-sm print:min-h-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
                <header className="flex items-center justify-between gap-4 border-b-[3px] border-[#1a1a8c] pb-4">
                    <div className="flex items-center gap-3">
                        <img src="/images/logo-universite-mahajanga.png" alt="Université de Mahajanga" className="h-12 w-12 object-contain" />
                        <div>
                            <p className="text-base font-extrabold">Bibliothèque Globale</p>
                            <p className="text-xs text-[#575e75]">Université de Mahajanga · Service Numérique</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9e6612]">Rapport mensuel</p>
                        <p className="text-xl font-extrabold first-letter:uppercase">{stats.month_label}</p>
                        {establishment && <p className="text-xs text-[#575e75]">Établissement : {establishment}</p>}
                    </div>
                </header>

                <section>
                    <h2 className="mb-2.5 text-sm font-extrabold text-[#11116f]">1. Indicateurs clés</h2>
                    <div className="grid grid-cols-3 gap-2.5">
                        {[
                            ["Membres actifs", fmt(k.active_members), `+${fmt(k.new_members)} ce mois`],
                            ["Demandes de compte", fmt(k.requests.current), `${change(k.requests.current, k.requests.previous)} vs mois précédent`],
                            ["Délai moyen de validation", formatDelay(k.validation_hours.current), k.validation_hours.previous !== null ? `${formatDelay(k.validation_hours.previous)} le mois précédent` : "—"],
                            ["Consultations", fmt(k.consultations.current), `${change(k.consultations.current, k.consultations.previous)} vs mois précédent`],
                            ["Questions à l'IA", fmt(k.ai_queries.current), `${change(k.ai_queries.current, k.ai_queries.previous)} vs mois précédent`],
                            ["Documents publiés", fmt(k.published_documents.current), `total : ${fmt(k.published_documents.total)}`],
                        ].map(([label, value, sub]) => (
                            <div key={label} className="rounded-lg border border-[#dde0ee] p-3">
                                <p className="text-[11px] text-[#575e75]">{label}</p>
                                <p className="text-[22px] font-extrabold">{value}</p>
                                <p className="text-[11px] text-[#575e75]">{sub}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="break-inside-avoid">
                    <h2 className="mb-1.5 text-sm font-extrabold text-[#11116f]">2. Demandes de compte sur 12 mois</h2>
                    <MonthlyChart type="line" labels={stats.series.labels} values={stats.series.requests} unit="demandes" ariaLabel="Demandes de compte sur 12 mois" printMode />
                </section>

                <div className="grid grid-cols-2 gap-6 break-inside-avoid">
                    <section>
                        <h2 className="mb-2 text-sm font-extrabold text-[#11116f]">3. Traitement des demandes du mois</h2>
                        <table className="w-full border-collapse text-xs">
                            <thead><tr className="bg-[#f1f2f9]"><th scope="col" className="px-2 py-1.5 text-left">Statut</th><th scope="col" className="px-2 py-1.5 text-right">Nombre</th></tr></thead>
                            <tbody>
                                {[["Reçues", s.received], ["Comptes activés", s.validee], ["Vérifiées (à valider)", s.verifiee], ["En cours", s.en_attente], ["Rejetées", s.rejetee], ["Expirées", s.expiree]].map(([label, value]) => (
                                    <tr key={label} className="border-b border-[#e8eaf3] last:border-0"><td className="px-2 py-1.5">{label}</td><td className="px-2 py-1.5 text-right font-semibold">{fmt(value)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                    <section>
                        <h2 className="mb-2 text-sm font-extrabold text-[#11116f]">4. Documents les plus consultés (12 mois)</h2>
                        <table className="w-full border-collapse text-xs">
                            <thead><tr className="bg-[#f1f2f9]"><th scope="col" className="px-2 py-1.5 text-left">Titre</th><th scope="col" className="px-2 py-1.5 text-right">Vues</th></tr></thead>
                            <tbody>
                                {stats.top_documents.length === 0 && <tr><td colSpan="2" className="px-2 py-1.5 text-[#575e75]">Aucune consultation.</td></tr>}
                                {stats.top_documents.map((d) => (
                                    <tr key={d.id} className="border-b border-[#e8eaf3] last:border-0"><td className="px-2 py-1.5">{d.title}</td><td className="px-2 py-1.5 text-right font-semibold">{fmt(d.views)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>

                <section className="break-inside-avoid">
                    <h2 className="mb-2 text-sm font-extrabold text-[#11116f]">5. Commentaire de l'administration</h2>
                    <label className="sr-only" htmlFor="remarque">Commentaire ajouté au rapport</label>
                    <textarea
                        id="remarque"
                        rows={3}
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        placeholder="Faits marquants du mois (facultatif) : écrit ici, il apparaît dans le PDF."
                        className="w-full rounded-lg border border-[#dde0ee] bg-white p-3 text-xs text-[#15212b] print:hidden"
                    />
                    <p className="hidden whitespace-pre-line text-xs leading-relaxed text-[#3a4256] print:block">{remark || "—"}</p>
                </section>

                <footer className="mt-auto flex justify-between border-t border-[#dde0ee] pt-3 text-[10px] text-[#575e75]">
                    <span>Généré le {generated} (heure de Madagascar) par {user?.name}</span>
                    <span>Bibliothèque Globale · Université de Mahajanga</span>
                </footer>
            </article>
        </div>
    );
}
