import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileDown, Printer, Search, Sparkles, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/search";
import { useToast } from "../../components/Toast";

const TYPES = [
    { key: "qcm", label: "QCM" },
    { key: "vrai_faux", label: "Vrai / faux" },
    { key: "ouverte", label: "Questions ouvertes" },
];
const LEVELS = ["", "L1", "L2", "L3", "M1", "M2", "Doctorat"];
const LETTERS = "ABCDEFGH";

const escapeHtml = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Feuille de questions (HTML) utilisée pour l'export Word et l'impression / PDF.
function sheetHtml({ title, documentTitle, type, questions, withAnswers }) {
    const body = questions.map((q, i) => {
        let answer = "";
        let choices = "";
        if (type === "qcm") {
            choices = `<ol type="A">${q.choices.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ol>`;
            answer = `Réponse : ${LETTERS[q.answer]}`;
        } else if (type === "vrai_faux") {
            choices = "<p>☐ Vrai &nbsp;&nbsp; ☐ Faux</p>";
            answer = `Réponse : ${q.answer ? "Vrai" : "Faux"}`;
        } else {
            choices = '<p style="color:#888">…………………………………………………………………………</p>';
            answer = `Réponse attendue : ${escapeHtml(q.answer)}`;
        }
        const corr = withAnswers
            ? `<p style="color:#0f7a4a"><b>${answer}</b>${q.explanation ? ` · ${escapeHtml(q.explanation)}` : ""}${q.page ? ` <i>(p. ${q.page})</i>` : ""}</p>`
            : "";
        return `<div style="margin-bottom:14px"><p><b>${i + 1}. ${escapeHtml(q.question)}</b></p>${choices}${corr}</div>`;
    }).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;line-height:1.4;margin:2cm}h1{font-size:16pt}p{margin:4px 0}ol{margin:4px 0 4px 24px}</style>
</head><body><h1>${escapeHtml(title)}</h1><p style="color:#555">D’après « ${escapeHtml(documentTitle)} »${withAnswers ? " · avec corrigé" : ""}</p><hr>${body}</body></html>`;
}

function download(filename, content, mime) {
    const url = URL.createObjectURL(new Blob(["﻿", content], { type: mime }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Choix du document dans le catalogue publié.
function DocumentPicker({ value, onChange }) {
    const [query, setQuery] = useState("");
    const q = useDebouncedValue(query.trim(), 350);
    const [results, setResults] = useState([]);

    // Sans recherche : les documents publiés les plus récents, pour choisir sans rien taper.
    useEffect(() => {
        let active = true;
        api.searchDocuments(q ? { q } : {}).then((r) => active && setResults(r.data || [])).catch(() => active && setResults([]));
        return () => { active = false; };
    }, [q]);

    if (value) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brass bg-indigo-50 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-semibold">{value.title}</span>
                <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1 text-slate-500 hover:bg-surface" aria-label="Changer de document"><X className="h-4 w-4" /></button>
            </div>
        );
    }

    return (
        <div>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un document du catalogue…" aria-label="Rechercher un document" className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm" />
            </div>
            {results.length > 0 && (
                <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
                    {results.slice(0, 10).map((doc) => (
                        <li key={doc.slug}>
                            <button type="button" onClick={() => onChange({ slug: doc.slug, title: doc.title })} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                                <span className="block truncate font-semibold">{doc.title}</span>
                                <span className="text-xs text-slate-500">{[doc.type, (doc.authors || []).join(", "), doc.year].filter(Boolean).join(" · ")}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// Une question modifiable avant export.
function QuestionCard({ index, type, question, onChange, onRemove }) {
    const set = (patch) => onChange({ ...question, ...patch });
    const input = "w-full rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-sm";

    return (
        <div className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-2">
                <span className="mt-1.5 text-sm font-extrabold text-brass">{index + 1}.</span>
                <textarea rows={2} value={question.question} onChange={(e) => set({ question: e.target.value })} aria-label={`Question ${index + 1}`} className={`${input} font-semibold`} />
                <button type="button" onClick={onRemove} title="Supprimer la question" aria-label="Supprimer la question" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-1.5 pl-5">
                {type === "qcm" && question.choices.map((choice, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={`answer-${index}`} checked={question.answer === i} onChange={() => set({ answer: i })} aria-label={`Bonne réponse : ${LETTERS[i]}`} className="accent-emerald-600" />
                        <b className="w-4 text-xs">{LETTERS[i]}</b>
                        <input value={choice} onChange={(e) => set({ choices: question.choices.map((c, j) => (j === i ? e.target.value : c)) })} aria-label={`Choix ${LETTERS[i]}`} className={`${input} ${question.answer === i ? "border-emerald-600" : ""}`} />
                    </label>
                ))}
                {type === "vrai_faux" && (
                    <div className="flex gap-4 text-sm">
                        {[true, false].map((v) => (
                            <label key={String(v)} className="flex items-center gap-1.5">
                                <input type="radio" name={`answer-${index}`} checked={question.answer === v} onChange={() => set({ answer: v })} className="accent-emerald-600" /> {v ? "Vrai" : "Faux"}
                            </label>
                        ))}
                    </div>
                )}
                {type === "ouverte" && (
                    <label className="block text-xs font-semibold text-slate-600">
                        Réponse attendue
                        <textarea rows={2} value={question.answer} onChange={(e) => set({ answer: e.target.value })} className={`${input} mt-1 font-normal`} />
                    </label>
                )}
                {(question.explanation || question.page) && (
                    <p className="pt-1 text-xs text-slate-500">
                        {question.explanation}{question.explanation && question.page ? " · " : ""}{question.page ? `Source : page ${question.page}` : ""}
                    </p>
                )}
                {!question.page && <p className="pt-1 text-xs text-amber-700">Page source non identifiée : vérifiez cette question.</p>}
            </div>
        </div>
    );
}

// Enseignant : questions de révision générées par l'IA à partir des pages d'un document, à relire puis exporter.
export default function RevisionQuestionsPage() {
    const toast = useToast();
    const [params] = useSearchParams();
    const [doc, setDoc] = useState(params.get("document") ? { slug: params.get("document"), title: params.get("titre") || params.get("document") } : null);
    const [form, setForm] = useState({ type: "qcm", count: 10, page_from: "", page_to: "", topic: "", level: "" });
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [withAnswers, setWithAnswers] = useState(true);

    async function generate(e) {
        e.preventDefault();
        if (!doc) return setError("Choisissez d’abord un document.");
        setBusy(true);
        setError(null);
        try {
            const payload = { type: form.type, count: Number(form.count) };
            ["page_from", "page_to", "topic", "level"].forEach((k) => form[k] !== "" && (payload[k] = k.startsWith("page") ? Number(form[k]) : form[k]));
            const r = await api.generateRevisionQuestions(doc.slug, payload);
            setResult({ ...r, type: form.type, title: `Questions de révision · ${r.document.title}` });
        } catch (err) {
            const errors = err?.data?.errors;
            setError(errors ? Object.values(errors).flat()[0] : err?.data?.message || "La génération a échoué. Réessayez.");
        } finally {
            setBusy(false);
        }
    }

    const sheet = () => sheetHtml({ title: result.title, documentTitle: result.document.title, type: result.type, questions: result.questions, withAnswers });

    function exportWord() {
        download(`${result.title.replace(/[\\/:*?"<>|]+/g, "-")}.doc`, sheet(), "application/msword");
        toast("Fichier Word téléchargé.");
    }

    function exportPdf() {
        const w = window.open("", "_blank");
        if (!w) return toast("Autorisez les fenêtres pour ce site afin d’imprimer.");
        w.document.write(sheet());
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    }

    const field = "mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal";

    return (
        <div>
            <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-extrabold">
                <Sparkles className="h-5 w-5 text-brass" /> Questions de révision
            </h2>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                L’assistant IA rédige des questions uniquement à partir des pages choisies, et indique la page source de chacune.
                Relisez et corrigez-les avant de les distribuer.
            </p>

            <form onSubmit={generate} className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-5">
                <div>
                    <span className="text-sm font-semibold text-slate-700">Document</span>
                    <div className="mt-1"><DocumentPicker value={doc} onChange={setDoc} /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                    <label className="block text-sm font-semibold text-slate-700">De la page
                        <input type="number" min={1} value={form.page_from} onChange={(e) => setForm({ ...form, page_from: e.target.value })} placeholder="1" className={field} />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">À la page
                        <input type="number" min={form.page_from || 1} value={form.page_to} onChange={(e) => setForm({ ...form, page_to: e.target.value })} placeholder="fin" className={field} />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Nombre
                        <input type="number" min={1} max={20} required value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} className={field} />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Niveau
                        <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className={field}>
                            {LEVELS.map((l) => <option key={l} value={l}>{l || "Non précisé"}</option>)}
                        </select>
                    </label>
                </div>
                <label className="block text-sm font-semibold text-slate-700">
                    Thème à privilégier <span className="font-normal text-slate-500">(facultatif)</span>
                    <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={200} placeholder="Ex. l’oscillateur harmonique" className={field} />
                </label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de questions">
                    {TYPES.map((t) => (
                        <button key={t.key} type="button" role="radio" aria-checked={form.type === t.key} onClick={() => setForm({ ...form, type: t.key })}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${form.type === t.key ? "border-brass bg-indigo-50 text-brass-deep" : "border-slate-200 text-slate-600 hover:border-brass"}`}>
                            {t.label}
                        </button>
                    ))}
                </div>
                {error && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}
                <div className="flex justify-end">
                    <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                        <Sparkles className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} /> {busy ? "Génération… (jusqu’à une minute)" : "Générer les questions"}
                    </button>
                </div>
            </form>

            {result && (
                <section aria-label="Questions générées">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-bold">{result.questions.length} question{result.questions.length > 1 ? "s" : ""} · {result.document.title}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5 text-sm text-slate-600">
                                <input type="checkbox" checked={withAnswers} onChange={(e) => setWithAnswers(e.target.checked)} className="accent-indigo-600" /> Inclure le corrigé
                            </label>
                            <button type="button" onClick={exportWord} disabled={!result.questions.length} className="btn-secondary disabled:opacity-50"><FileDown className="h-4 w-4" /> Word</button>
                            <button type="button" onClick={exportPdf} disabled={!result.questions.length} className="btn-secondary disabled:opacity-50"><Printer className="h-4 w-4" /> Imprimer / PDF</button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {result.questions.map((q, i) => (
                            <QuestionCard
                                key={i}
                                index={i}
                                type={result.type}
                                question={q}
                                onChange={(next) => setResult((r) => ({ ...r, questions: r.questions.map((x, j) => (j === i ? next : x)) }))}
                                onRemove={() => setResult((r) => ({ ...r, questions: r.questions.filter((_, j) => j !== i) }))}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
