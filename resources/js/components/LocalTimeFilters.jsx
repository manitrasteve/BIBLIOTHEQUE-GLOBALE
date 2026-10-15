// Champs de filtre « Date / Jour de la semaine / Heure » partagés (Messages, Mes activités).
// Valeurs : { date: "AAAA-MM-JJ", weekday: "1".."7" (1 = lundi), time_from: "HH:MM", time_to: "HH:MM" },
// interprétées par le serveur à l'heure locale (App\Support\LocalTimeFilter).

export const EMPTY_TIME_FILTERS = { date: "", weekday: "", time_from: "", time_to: "" };

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export const filterFieldClass = "w-full rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-700";

export default function LocalTimeFilters({ value, onChange, timeLabel = "Heure" }) {
    return (
        <>
            <label className="block text-xs font-semibold text-slate-600">
                Date
                <input type="date" value={value.date} onChange={(e) => onChange("date", e.target.value)} className={`mt-1 ${filterFieldClass}`} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
                Jour de la semaine
                <select value={value.weekday} onChange={(e) => onChange("weekday", e.target.value)} className={`mt-1 ${filterFieldClass}`}>
                    <option value="">Tous les jours</option>
                    {WEEKDAYS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
                </select>
            </label>
            <div className="block text-xs font-semibold text-slate-600">
                {timeLabel}
                <div className="mt-1 flex items-center gap-1.5">
                    <input type="time" value={value.time_from} onChange={(e) => onChange("time_from", e.target.value)} aria-label={`${timeLabel} : à partir de`} className={filterFieldClass} />
                    <span className="text-slate-400">à</span>
                    <input type="time" value={value.time_to} onChange={(e) => onChange("time_to", e.target.value)} aria-label={`${timeLabel} : jusqu'à`} className={filterFieldClass} />
                </div>
            </div>
        </>
    );
}
