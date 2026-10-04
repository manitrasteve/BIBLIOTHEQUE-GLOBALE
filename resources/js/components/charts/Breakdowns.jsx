// Répartitions de la page Statistiques et du rapport : barres horizontales et part par rôle.
const fmt = (value) => new Intl.NumberFormat("fr-FR").format(value);

// Barres horizontales (une seule série : couleur principale), valeur écrite en clair à droite.
export function HBarList({ items, emptyText = "Aucune donnée sur la période." }) {
    if (!items.length) return <p className="text-sm text-ink-soft">{emptyText}</p>;
    const max = Math.max(...items.map((item) => item.value), 1);

    return (
        <ol className="flex flex-col gap-3.5 text-sm">
            {items.map((item) => (
                <li key={item.label} title={`${item.label} : ${fmt(item.value)}`}>
                    <div className="flex justify-between gap-3">
                        <span className="min-w-0 truncate text-ink">{item.label}</span>
                        <strong className="shrink-0 text-ink">{fmt(item.value)}</strong>
                    </div>
                    <div className="mt-1.5 h-2 rounded bg-indigo-50">
                        <div className="h-2 rounded bg-chart-main" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
                    </div>
                </li>
            ))}
        </ol>
    );
}

const ROLES = [
    ["etudiant", "Étudiants", "bg-chart-1"],
    ["enseignant", "Enseignants", "bg-chart-2"],
    ["chercheur", "Chercheurs", "bg-chart-3"],
];

// Part de chaque rôle : barre empilée (2 px d'écart entre segments) + légende avec nombres et pourcentages.
export function RoleShare({ roles }) {
    const total = ROLES.reduce((sum, [key]) => sum + (roles[key] ?? 0), 0);
    const pct = (value) => (total ? Math.round((value / total) * 100) : 0);

    return (
        <div className="flex flex-col gap-4">
            <div
                role="img"
                aria-label={ROLES.map(([key, label]) => `${label} ${pct(roles[key] ?? 0)} %`).join(", ")}
                className="flex h-7 gap-0.5 overflow-hidden rounded bg-indigo-50"
            >
                {ROLES.filter(([key]) => roles[key] > 0).map(([key, label, color]) => (
                    <div key={key} title={`${label} : ${fmt(roles[key])} (${pct(roles[key])} %)`} className={color} style={{ width: `${(roles[key] / total) * 100}%` }} />
                ))}
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
                {ROLES.map(([key, label, color]) => (
                    <li key={key} className="flex items-center gap-2.5">
                        <span className={`h-3 w-3 shrink-0 rounded-sm ${color}`} aria-hidden="true" />
                        <span className="flex-1 text-ink">{label}</span>
                        <strong className="text-ink">{fmt(roles[key] ?? 0)}</strong>
                        <span className="w-11 text-right text-ink-soft">{pct(roles[key] ?? 0)} %</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Évolution par rapport au mois précédent : « ▲ +25 % vs sept. » (null si pas de base de comparaison). */
export function trend(current, previous, previousLabel) {
    if (previous === null || previous === undefined || current === null || current === undefined) return null;
    if (previous === 0) return current > 0 ? `Nouveau ce mois (aucun en ${previousLabel})` : `Aucun en ${previousLabel} non plus`;
    const change = Math.round(((current - previous) / previous) * 100);
    if (change === 0) return `= stable vs ${previousLabel}`;
    return `${change > 0 ? "▲ +" : "▼ "}${change} % vs ${previousLabel}`;
}
