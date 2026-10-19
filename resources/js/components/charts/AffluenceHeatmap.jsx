import { useState } from "react";

// Carte d'affluence : jour de la semaine × heure locale, une seule teinte (--color-chart-main) du clair
// au foncé selon le nombre. Survol : valeur de la case ; « Afficher les données » : tableau complet.
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
// Intensité de la teinte par niveau (0 = case vide, fond neutre).
const LEVELS = [0, 18, 36, 56, 78, 100];
// Géométrie de la grille pour placer l'infobulle : ligne d'en-tête (16 px + écart), lignes de 28 px + 2 px d'écart.
const ROW_TOP = 18;
const ROW_STEP = 30;

const fmt = (value) => new Intl.NumberFormat("fr-FR").format(value);
const hourRange = (h) => `${h} h – ${h + 1 === 24 ? 0 : h + 1} h`;

function level(value, max) {
    if (value <= 0 || max <= 0) return 0;
    return Math.min(5, 1 + Math.floor((value / max) * 4.999));
}

function cellColor(lvl) {
    return lvl === 0
        ? "var(--color-slate-100)"
        : `color-mix(in srgb, var(--color-chart-main) ${LEVELS[lvl]}%, var(--color-surface))`;
}

export default function AffluenceHeatmap({ grid, unit, periodLabel }) {
    const [hovered, setHovered] = useState(null);

    const values = grid.flat();
    const max = Math.max(...values, 0);
    const total = values.reduce((sum, v) => sum + v, 0);

    if (total === 0) {
        return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">Aucune donnée sur la période choisie.</p>;
    }

    let peak = { day: 0, hour: 0, value: -1 };
    grid.forEach((row, day) => row.forEach((value, hour) => {
        if (value > peak.value) peak = { day, hour, value };
    }));
    const dayTotals = grid.map((row) => row.reduce((sum, v) => sum + v, 0));
    const busiestDay = dayTotals.indexOf(Math.max(...dayTotals));
    const weekdayShare = Math.round((dayTotals.slice(0, 5).reduce((a, b) => a + b, 0) / total) * 100);

    return (
        <div>
            <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
                <div>
                    <dt className="text-xs font-semibold text-ink-soft">Total ({periodLabel})</dt>
                    <dd className="text-xl font-extrabold tabular-nums text-ink">{fmt(total)}</dd>
                </div>
                <div>
                    <dt className="text-xs font-semibold text-ink-soft">Heure de pointe</dt>
                    <dd className="text-xl font-extrabold text-ink">{DAYS[peak.day].toLowerCase()} {peak.hour} h</dd>
                </div>
                <div>
                    <dt className="text-xs font-semibold text-ink-soft">Jour le plus actif</dt>
                    <dd className="text-xl font-extrabold text-ink">{DAYS[busiestDay].toLowerCase()}</dd>
                </div>
                <div>
                    <dt className="text-xs font-semibold text-ink-soft">En semaine (lun.–ven.)</dt>
                    <dd className="text-xl font-extrabold tabular-nums text-ink">{weekdayShare} %</dd>
                </div>
            </dl>

            {/* Le conteneur relatif est DANS la zone défilante : l'infobulle suit la case même après défilement. */}
            <div className="overflow-x-auto">
                <div className="relative min-w-[640px]">
                <div
                    role="img"
                    aria-label={`Carte d'affluence des ${unit} par jour et par heure. Pic : ${DAYS[peak.day].toLowerCase()} ${hourRange(peak.hour)}, ${fmt(peak.value)} ${unit}.`}
                    className="grid gap-[2px]"
                    style={{ gridTemplateColumns: "72px repeat(24, minmax(20px, 1fr))" }}
                    onMouseLeave={() => setHovered(null)}
                >
                    <span />
                    {HOURS.map((h) => (
                        <span key={h} className="h-4 text-center text-[11px] leading-4 tabular-nums text-ink-soft">{h % 3 === 0 ? `${h}h` : ""}</span>
                    ))}
                    {grid.map((row, day) => (
                        <div key={day} className="contents">
                            <span className="flex items-center text-xs font-semibold text-ink-soft">{DAYS[day]}</span>
                            {row.map((value, hour) => {
                                const isHovered = hovered?.day === day && hovered?.hour === hour;
                                return (
                                    <span
                                        key={hour}
                                        className={`h-7 rounded ${isHovered ? "outline outline-2 outline-offset-1 outline-[var(--color-ink)]" : ""}`}
                                        style={{ background: cellColor(level(value, max)) }}
                                        onMouseEnter={() => setHovered({ day, hour, value })}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>

                {hovered && (
                    <div
                        role="status"
                        // Lignes du haut : infobulle sous la case, sinon elle sortirait de la zone défilante.
                        className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg ${hovered.day < 2 ? "" : "-translate-y-full"}`}
                        style={{
                            left: `calc(72px + (100% - 72px) * ${(hovered.hour + 0.5) / 24})`,
                            top: `${ROW_TOP + (hovered.day + (hovered.day < 2 ? 1 : 0)) * ROW_STEP + (hovered.day < 2 ? 4 : -4)}px`,
                        }}
                    >
                        <span className="block font-semibold text-ink-soft">{DAYS[hovered.day]}, {hourRange(hovered.hour)}</span>
                        <span className="text-sm font-bold text-ink">{fmt(hovered.value)}</span> <span className="text-ink-soft">{unit}</span>
                    </div>
                )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-ink-soft" aria-hidden="true">
                    <span>Moins</span>
                    <span className="flex gap-[2px]">
                        {LEVELS.map((_, lvl) => <i key={lvl} className="h-2.5 w-5 rounded-sm" style={{ background: cellColor(lvl) }} />)}
                    </span>
                    <span>Plus</span>
                </div>
                <p className="text-xs text-ink-soft">Heure de Madagascar · {periodLabel}</p>
            </div>

            <details className="mt-3 text-sm text-ink-soft">
                <summary className="cursor-pointer font-semibold">Afficher les données</summary>
                <div className="mt-2 overflow-x-auto">
                    <table className="text-xs tabular-nums text-ink">
                        <thead>
                            <tr>
                                <th scope="col" className="py-1 pr-3 text-left font-semibold text-ink-soft">Jour</th>
                                {HOURS.map((h) => <th key={h} scope="col" className="px-1.5 py-1 font-semibold text-ink-soft">{h}h</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {grid.map((row, day) => (
                                <tr key={day} className="border-t border-line">
                                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-ink-soft">{DAYS[day]}</th>
                                    {row.map((value, hour) => <td key={hour} className="px-1.5 py-1 text-right">{value}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}
