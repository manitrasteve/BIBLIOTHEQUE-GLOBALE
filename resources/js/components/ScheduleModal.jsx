import { useState } from "react";
import { CalendarClock, X } from "lucide-react";

// « 2026-10-12T08:00 » (heure locale) : format attendu par <input type="datetime-local">.
function toLocalInput(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Par défaut : demain à 8 h, ou la date déjà prévue quand on la modifie.
function defaultValue(current) {
    if (current) return toLocalInput(new Date(current));
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return toLocalInput(d);
}

// Raccourcis proposés sous le champ (calculés à l'ouverture de la fenêtre).
function quickChoices() {
    const now = new Date();
    const at = (days, hours) => {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
        d.setHours(hours, 0, 0, 0);
        return d;
    };
    const inOneHour = new Date(now);
    inOneHour.setMinutes(inOneHour.getMinutes() + 60, 0, 0);
    const nextMonday = at((8 - now.getDay()) % 7 || 7, 8);

    return [
        { label: "Dans 1 heure", date: inOneHour },
        ...(now.getHours() < 17 ? [{ label: "Aujourd’hui 18 h", date: at(0, 18) }] : []),
        { label: "Demain 8 h", date: at(1, 8) },
        { label: "Lundi 8 h", date: nextMonday },
    ];
}

export function formatScheduledAt(value) {
    return new Date(value).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// Fenêtre « Programmer la publication » de la liste des documents.
// `onConfirm(isoDate)` doit rejeter avec le message du serveur en cas d'erreur.
export default function ScheduleModal({ document, onCancel, onConfirm }) {
    const [value, setValue] = useState(() => defaultValue(document.scheduled_at));
    const [error, setError] = useState(null);
    const [sending, setSending] = useState(false);
    const [choices] = useState(quickChoices);
    const date = value ? new Date(value) : null;
    // La minute en cours est acceptée : le document est alors publié dans la minute.
    const startOfMinute = new Date();
    startOfMinute.setSeconds(0, 0);
    const inPast = date && date < startOfMinute;
    const soon = date && !inPast && date - new Date() < 60000;

    async function submit(e) {
        e.preventDefault();
        if (!date || inPast) return;
        setSending(true);
        setError(null);
        try {
            await onConfirm(date.toISOString());
        } catch (err) {
            setError(err?.data?.errors?.scheduled_at?.[0] || err?.data?.message || "La programmation a échoué. Réessayez.");
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
            <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 id="schedule-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
                            <CalendarClock className="h-5 w-5 text-brass" /> Programmer la publication
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">{document.title}</p>
                    </div>
                    <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <label htmlFor="schedule-at" className="mt-5 block text-sm font-semibold text-slate-700">
                    Date et heure de mise en ligne
                </label>
                <input
                    id="schedule-at"
                    type="datetime-local"
                    required
                    autoFocus
                    value={value}
                    min={toLocalInput(startOfMinute)}
                    onChange={(e) => setValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm outline-none focus:border-brass"
                />
                <div className="mt-2 flex flex-wrap gap-2" aria-label="Choix rapides">
                    {choices.map((choice) => (
                        <button
                            key={choice.label}
                            type="button"
                            onClick={() => setValue(toLocalInput(choice.date))}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${value === toLocalInput(choice.date) ? "border-brass bg-indigo-50 text-brass-deep" : "border-slate-200 text-slate-600 hover:border-brass"}`}
                        >
                            {choice.label}
                        </button>
                    ))}
                </div>
                {inPast ? (
                    <p className="mt-2 text-xs font-medium text-rose-700">
                        Le {formatScheduledAt(date)} est déjà passé. Nous sommes le {formatScheduledAt(new Date())} : vérifiez le jour et le mois.
                    </p>
                ) : soon ? (
                    <p className="mt-2 text-xs text-slate-500">Publication dans moins d’une minute. Les lecteurs seront notifiés à ce moment-là.</p>
                ) : (
                    date && <p className="mt-2 text-xs text-slate-500">Publication le {formatScheduledAt(date)}. Les lecteurs seront notifiés à ce moment-là.</p>
                )}
                {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

                <div className="mt-5 flex justify-end gap-3">
                    <button type="button" onClick={onCancel} className="btn-secondary">Annuler</button>
                    <button type="submit" disabled={!date || inPast || sending} className="btn-primary disabled:opacity-50">
                        {sending ? "Enregistrement…" : "Programmer"}
                    </button>
                </div>
            </form>
        </div>
    );
}
