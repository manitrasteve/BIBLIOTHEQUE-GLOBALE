// En-tête de la colonne « Actions » des tableaux : les boutons d'action des lignes sont toujours affichés.
export default function ActionsTh({ align = "right" }) {
    return (
        <th className={`px-4 py-3 uppercase ${align === "right" ? "text-right" : "text-left"}`}>
            Actions
        </th>
    );
}
