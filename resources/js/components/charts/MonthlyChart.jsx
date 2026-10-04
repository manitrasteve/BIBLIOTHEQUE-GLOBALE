import { useState } from "react";

// Graphique mensuel (courbe ou histogramme) en SVG, sans bibliothèque : une seule série, couleur du thème
// (--color-chart-main, claire en mode sombre). Survol : valeur du mois ; « Afficher les données » : tableau.
const W = 640;
const H = 220;
const PAD = { left: 44, right: 12, top: 18, bottom: 28 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// Pas de graduation « ronds » (1, 2, 2,5, 5 × 10ⁿ) : 4 intervalles réguliers jusqu'au maximum.
function niceStep(value) {
    if (value <= 1) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    const n = value / power;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power;
}

const fmt = (value) => new Intl.NumberFormat("fr-FR").format(value);

export default function MonthlyChart({ type = "line", labels, values, unit, ariaLabel, printMode = false }) {
    const [hovered, setHovered] = useState(null);
    const n = values.length;
    const step = niceStep(Math.max(...values, 0) / 4);
    const max = step * 4;
    const slot = PLOT_W / n;
    const xAt = (i) => (type === "line" && n > 1 ? PAD.left + (PLOT_W * i) / (n - 1) : PAD.left + slot * i + slot / 2);
    const yAt = (v) => PAD.top + PLOT_H * (1 - v / max);
    const base = PAD.top + PLOT_H;
    const short = (label) => label.split(" ")[0].replace(".", "");

    // Étiquettes directes sélectives : le maximum et le dernier mois (jamais toutes les valeurs).
    const peak = values.indexOf(Math.max(...values));
    const labelled = new Set(values.some((v) => v > 0) ? [peak, n - 1] : []);

    const points = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
    const barW = Math.min(slot * 0.56, 36);
    const barPath = (v, i) => {
        const x = xAt(i) - barW / 2;
        const y = yAt(v);
        const r = Math.min(4, (base - y) / 2);
        if (v <= 0) return "";
        return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${base} Z`;
    };

    return (
        <div>
            <div className="relative text-chart-main">
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block overflow-visible">
                    {[1, 2, 3, 4].map((k) => (
                        <line key={k} x1={PAD.left} x2={W - PAD.right} y1={yAt(step * k)} y2={yAt(step * k)} className="stroke-line" strokeWidth="1" />
                    ))}
                    {[0, 1, 2, 3, 4].map((k) => (
                        <text key={k} x={PAD.left - 8} y={yAt(step * k) + 4} textAnchor="end" fontSize="11" className="fill-ink-soft">
                            {fmt(step * k)}
                        </text>
                    ))}

                    {type === "line" ? (
                        <>
                            <path d={`M${xAt(0)},${base} L${points.replaceAll(" ", " L")} L${xAt(n - 1)},${base} Z`} fill="currentColor" fillOpacity="0.08" />
                            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                            {values.map((v, i) => (
                                <circle key={i} cx={xAt(i)} cy={yAt(v)} r={hovered === i || labelled.has(i) ? 5 : 4} fill="currentColor" stroke="var(--color-surface)" strokeWidth="2" />
                            ))}
                        </>
                    ) : (
                        values.map((v, i) => (
                            <path key={i} d={barPath(v, i)} fill="currentColor" fillOpacity={hovered === null || hovered === i ? 1 : 0.55} />
                        ))
                    )}

                    <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} className="stroke-slate-300" strokeWidth="1" />

                    {[...labelled].map((i) => (
                        <text key={i} x={xAt(i)} y={yAt(values[i]) - 10} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">
                            {fmt(values[i])}
                        </text>
                    ))}
                    {labels.map((label, i) => (
                        <text key={label} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink-soft">
                            {short(label)}
                        </text>
                    ))}

                    {/* Zones de survol : toute la hauteur de chaque mois (plus grandes que la marque). */}
                    {!printMode && values.map((v, i) => (
                        <rect
                            key={i}
                            x={type === "line" && n > 1 ? xAt(i) - PLOT_W / (n - 1) / 2 : PAD.left + slot * i}
                            y={PAD.top}
                            width={type === "line" && n > 1 ? PLOT_W / (n - 1) : slot}
                            height={PLOT_H}
                            fill="transparent"
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                        />
                    ))}
                    {hovered !== null && type === "line" && (
                        <line x1={xAt(hovered)} x2={xAt(hovered)} y1={PAD.top} y2={base} className="stroke-slate-300" strokeDasharray="3 3" pointerEvents="none" />
                    )}
                </svg>

                {hovered !== null && (
                    <div
                        role="status"
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
                        style={{ left: `${(xAt(hovered) / W) * 100}%`, top: `${(yAt(values[hovered]) / H) * 100}%`, marginTop: -12 }}
                    >
                        <span className="block font-semibold text-ink-soft">{labels[hovered]}</span>
                        <span className="text-sm font-bold text-ink">{fmt(values[hovered])}</span> <span className="text-ink-soft">{unit}</span>
                    </div>
                )}
            </div>

            {!printMode && (
                <details className="mt-3 text-sm text-ink-soft">
                    <summary className="cursor-pointer font-semibold">Afficher les données</summary>
                    <div className="mt-2 overflow-x-auto">
                        <table className="text-xs text-ink">
                            <tbody>
                                <tr>
                                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-ink-soft">Mois</th>
                                    {labels.map((label) => <td key={label} className="px-2 py-1 whitespace-nowrap">{label}</td>)}
                                </tr>
                                <tr>
                                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-ink-soft first-letter:uppercase">{unit}</th>
                                    {values.map((v, i) => <td key={i} className="px-2 py-1 font-semibold">{fmt(v)}</td>)}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </details>
            )}
        </div>
    );
}
