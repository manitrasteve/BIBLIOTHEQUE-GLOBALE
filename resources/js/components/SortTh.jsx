import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

// En-tête de colonne cliquable pour trier un tableau. `sort` = { key, dir } et
// `setSort` sont détenus par la page (un état par tableau).
export default function SortTh({ label, sortKey, sort, setSort }) {
  const active = sort.key === sortKey;
  return (
    <th
      className="px-4 py-3 text-left cursor-pointer select-none hover:opacity-70"
      onClick={() => setSort((prev) => (prev.key === sortKey ? { key: sortKey, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: sortKey, dir: "asc" }))}
    >
      {label}
      {active ? (
        sort.dir === "asc" ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />
      ) : (
        <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />
      )}
    </th>
  );
}
