import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { api } from "../lib/api";

// Mêmes limites que le serveur (ProblemReportController::store).
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const TYPES = [
    ["login", "Connexion"],
    ["profile", "Profil"],
    ["email", "E-mail"],
    ["password", "Mot de passe"],
    ["document", "Lecture d'un document"],
    ["ai", "Assistant IA"],
    ["favorites", "Favoris"],
    ["notifications", "Notifications"],
    ["display", "Affichage"],
    ["autre", "Autre"],
];

const initialForm = { type: "login", subject: "", description: "" };

const labelClass = "block text-sm font-semibold text-slate-700";
const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-900 outline-none focus:border-brass focus:ring-2 focus:ring-indigo-200";

export default function ProblemReportPage() {
    const [form, setForm] = useState(initialForm);
    const [file, setFile] = useState(null);
    // Change à chaque envoi pour vider le champ fichier (non contrôlé par React).
    const [fileKey, setFileKey] = useState(0);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    function update(field, value) {
        setSent(false);
        setForm((current) => ({ ...current, [field]: value }));
    }

    function chooseFile(event) {
        const chosen = event.target.files?.[0] || null;
        setSent(false);
        setError(null);

        if (chosen && !chosen.type.startsWith("image/")) {
            setError("La capture d'écran doit être une image (JPG, PNG, WebP…).");
            setFile(null);
            setFileKey((key) => key + 1);
            return;
        }
        if (chosen && chosen.size > MAX_SCREENSHOT_BYTES) {
            setError("La capture d'écran ne doit pas dépasser 5 Mo.");
            setFile(null);
            setFileKey((key) => key + 1);
            return;
        }

        setFile(chosen);
    }

    async function submit(event) {
        event.preventDefault();
        if (submitting) return;

        setError(null);
        setSent(false);
        setSubmitting(true);

        const data = new FormData();
        data.append("type", form.type);
        data.append("subject", form.subject.trim());
        data.append("description", form.description.trim());
        if (file) data.append("screenshot", file);

        try {
            await api.createProblemReport(data);
            setForm(initialForm);
            setFile(null);
            setFileKey((key) => key + 1);
            setSent(true);
        } catch (err) {
            const errors = err?.data?.errors;
            setError(errors ? Object.values(errors)?.[0]?.[0] : err?.data?.message || "Envoi impossible.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="w-full">
            <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-extrabold">
                <LifeBuoy className="h-5 w-5 text-brass" />
                Signaler un problème
            </h2>

            {sent && (
                <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                    Votre signalement a été transmis à l'administrateur.
                </div>
            )}

            {error && (
                <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <form onSubmit={submit} className="modern-card space-y-5 p-4">
                <label className={labelClass}>
                    Type de problème *
                    <select value={form.type} onChange={(event) => update("type", event.target.value)} className={inputClass}>
                        {TYPES.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className={labelClass}>
                    Sujet *
                    <input
                        required
                        maxLength={255}
                        placeholder="Ex. : impossible d'ouvrir un document"
                        value={form.subject}
                        onChange={(event) => update("subject", event.target.value)}
                        className={inputClass}
                    />
                </label>

                <label className={labelClass}>
                    Description *
                    <textarea
                        required
                        rows={7}
                        maxLength={5000}
                        placeholder="Décrivez le problème : ce que vous faisiez, ce qui s'est passé, le message affiché…"
                        value={form.description}
                        onChange={(event) => update("description", event.target.value)}
                        className={inputClass}
                    />
                    <span className="mt-1 block text-right text-xs font-normal text-slate-500">
                        {form.description.length} / 5000
                    </span>
                </label>

                <label className={labelClass}>
                    Capture d'écran (facultative)
                    <input
                        key={fileKey}
                        type="file"
                        accept="image/*"
                        onChange={chooseFile}
                        className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700`}
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">Image uniquement, 5 Mo au maximum.</span>
                </label>

                <button type="submit" disabled={submitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting ? "Envoi en cours…" : "Envoyer le signalement"}
                </button>
            </form>
        </div>
    );
}
