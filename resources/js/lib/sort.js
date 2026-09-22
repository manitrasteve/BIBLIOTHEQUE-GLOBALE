// Tri générique de tableaux (utilisé par les pages avec des tableaux triables).
export function compareVals(va, vb, dir) {
  if (va == null) va = "";
  if (vb == null) vb = "";
  if (typeof va === "string") va = va.toLowerCase();
  if (typeof vb === "string") vb = vb.toLowerCase();
  if (va < vb) return dir === "asc" ? -1 : 1;
  if (va > vb) return dir === "asc" ? 1 : -1;
  return 0;
}

// sort = { key, dir }. getVal(row, key) retourne la valeur à comparer pour cette colonne.
export function sortRows(list, sort, getVal) {
  if (!sort?.key) return list;
  return [...list].sort((a, b) => compareVals(getVal(a, sort.key), getVal(b, sort.key), sort.dir));
}
