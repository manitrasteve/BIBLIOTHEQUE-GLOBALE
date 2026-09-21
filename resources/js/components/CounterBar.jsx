// Bandeau de compteurs : « Total : X » puis un nombre par état. Les valeurs viennent toujours du serveur
// (ou des lignes déjà chargées) ; ce composant ne fait qu'afficher. Couleurs du thème (clair / sombre).
export default function CounterBar({ total, items = [], note }) {
    if (total === null || total === undefined) return null;

    return (
        <div
            className="mb-5 rounded-xl border border-line bg-paper-dim px-4 py-3"
            role="status"
            aria-live="polite"
        >
            <p className="text-sm font-bold text-ink">Total : {total}</p>

            {items.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
                    {items.map((item) => (
                        <li key={item.label} className="whitespace-nowrap">
                            {item.label} : <strong className="font-semibold text-ink">{item.value ?? 0}</strong>
                        </li>
                    ))}
                </ul>
            )}

            {note && <p className="mt-2 text-xs text-ink-soft">{note}</p>}
        </div>
    );
}
