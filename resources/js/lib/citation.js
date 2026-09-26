// Citation d'un document du catalogue (APA 7, ISO 690, BibTeX) à partir de ses métadonnées.
// Les auteurs sont saisis librement : « Jean Dupont » ou « Dupont, Jean » sont tous deux compris.

function splitName(raw) {
    const name = String(raw || "").trim().replace(/\s+/g, " ");
    if (!name) return null;
    if (name.includes(",")) {
        const [last, ...rest] = name.split(",");
        return { last: last.trim(), first: rest.join(",").trim() };
    }
    const parts = name.split(" ");
    if (parts.length === 1) return { last: parts[0], first: "" };
    return { last: parts.pop(), first: parts.join(" ") };
}

// « Jean-Pierre Marie » → « J.-P. M. »
function initials(first) {
    return first
        .split(" ")
        .filter(Boolean)
        .map((word) => word.split("-").map((p) => `${p.charAt(0).toUpperCase()}.`).join("-"))
        .join(" ");
}

function kind(type) {
    const t = String(type || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    if (t.includes("these")) return "these";
    if (t.includes("memoire")) return "memoire";
    if (t.includes("rapport")) return "rapport";
    if (t.includes("livre") || t.includes("ouvrage")) return "livre";
    return "autre";
}

function fullTitle(doc) {
    return doc.subtitle ? `${doc.title} : ${doc.subtitle}` : doc.title;
}

function stripEnd(text) {
    return String(text).replace(/[.\s]+$/, "");
}

export function apa(doc) {
    const names = (doc.authors || []).map(splitName).filter(Boolean);
    const formatted = names.map((n) => (n.first ? `${n.last}, ${initials(n.first)}` : n.last));
    let authors = "";
    if (formatted.length === 1) authors = formatted[0];
    else if (formatted.length > 1) authors = `${formatted.slice(0, -1).join(", ")}, & ${formatted.at(-1)}`;

    const year = doc.year ? `(${doc.year})` : "(s.d.)";
    const edition = doc.edition ? ` (${String(doc.edition).trim()})` : "";
    const k = kind(doc.type);
    const nature =
        k === "these" ? ` [Thèse de doctorat${doc.library ? `, ${doc.library}` : ""}]`
            : k === "memoire" ? ` [Mémoire${doc.niveau ? ` de ${doc.niveau}` : ""}${doc.library ? `, ${doc.library}` : ""}]`
            : "";
    const publisher = doc.publisher ? ` ${stripEnd(doc.publisher)}.` : "";

    const work = `${stripEnd(fullTitle(doc))}${edition}${nature}`;
    // Sans auteur, APA place le titre en tête.
    return (authors ? `${stripEnd(authors)}. ${year}. ${work}.${publisher}` : `${work}. ${year}.${publisher}`).trim();
}

export function iso690(doc) {
    const names = (doc.authors || []).map(splitName).filter(Boolean);
    const authors = names.map((n) => (n.first ? `${n.last.toUpperCase()}, ${n.first}` : n.last.toUpperCase())).join(", ");
    const k = kind(doc.type);
    const nature =
        k === "these" ? " Thèse de doctorat."
            : k === "memoire" ? ` Mémoire${doc.niveau ? ` de ${doc.niveau}` : ""}.`
            : "";
    const parts = [
        authors ? `${authors}.` : "",
        `${stripEnd(fullTitle(doc))}.`,
        doc.edition ? `${stripEnd(doc.edition)}.` : "",
        nature.trim(),
        [doc.publisher || doc.library, doc.year].filter(Boolean).join(", ") + (doc.publisher || doc.library || doc.year ? "." : ""),
        doc.isbn ? `ISBN ${doc.isbn}.` : "",
    ];
    return parts.filter(Boolean).join(" ");
}

function bibtexEscape(value) {
    return String(value).replace(/([{}%&$#_])/g, "\\$1");
}

export function bibtex(doc) {
    const names = (doc.authors || []).map(splitName).filter(Boolean);
    const k = kind(doc.type);
    const entry = { these: "phdthesis", memoire: "mastersthesis", rapport: "techreport", livre: "book" }[k] || "misc";
    const firstLast = names[0]?.last || "anonyme";
    const key = `${firstLast}${doc.year || ""}`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]/g, "")
        .toLowerCase();

    const fields = [
        ["author", names.map((n) => (n.first ? `${n.last}, ${n.first}` : n.last)).join(" and ")],
        ["title", fullTitle(doc)],
        ["year", doc.year],
        ["edition", doc.edition],
        [entry === "book" || entry === "misc" ? "publisher" : entry === "techreport" ? "institution" : "school", entry === "book" || entry === "misc" ? doc.publisher : doc.library],
        ["isbn", doc.isbn],
        ["keywords", doc.keywords],
        ["language", doc.language],
    ].filter(([, v]) => v);

    const body = fields.map(([name, value]) => `  ${name} = {${bibtexEscape(value)}}`).join(",\n");
    return `@${entry}{${key || "document"},\n${body}\n}`;
}

export const CITATION_STYLES = [
    { key: "apa", label: "APA 7", format: apa },
    { key: "iso690", label: "ISO 690", format: iso690 },
    { key: "bibtex", label: "BibTeX", format: bibtex },
];
