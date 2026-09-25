import { forwardRef } from "react";

// Mode « Texte » du lecteur : le texte extrait par pdf.js est remis en forme
// (titres, paragraphes) dans une colonne de lecture confortable. Les images,
// tableaux et formules ne sont visibles qu'en mode PDF.

// Taille de police d'un élément de texte pdf.js (hauteur de sa matrice de transformation).
function fontSizeOf(item) {
    const t = item.transform || [];
    return Math.hypot(t[2] || 0, t[3] || 0) || item.height || 0;
}

// Regroupe les éléments de texte d'une page en lignes, puis en titres et paragraphes.
export function buildTextBlocks(items) {
    const lines = [];
    let line = { text: "", size: 0, y: null };
    const flush = () => {
        lines.push(line);
        line = { text: "", size: 0, y: null };
    };
    items.forEach((item) => {
        if (typeof item.str !== "string") return;
        if (item.str) {
            line.text += item.str;
            line.size = Math.max(line.size, fontSizeOf(item));
            if (line.y === null) line.y = item.transform?.[5] ?? 0;
        }
        if (item.hasEOL) flush();
    });
    flush();

    const filled = lines
        .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
        .filter((l) => l.text);
    if (!filled.length) return [];

    // Taille du texte courant : médiane pondérée par le nombre de caractères.
    const bySize = [...filled].sort((a, b) => a.size - b.size);
    const total = bySize.reduce((n, l) => n + l.text.length, 0);
    let acc = 0;
    const bodySize = bySize.find((l) => (acc += l.text.length) >= total / 2)?.size || 0;

    const blocks = [];
    let prev = null;
    filled.forEach((l) => {
        // Titre : ligne courte, en plus grand, qui ne continue pas une phrase.
        const heading =
            bodySize > 0 && l.size >= bodySize * 1.2 && l.text.length <= 90 && !/[,;:]$/.test(l.text);
        const bullet = /^([•▪◦●‣–-]|\d{1,2}[.)])\s/.test(l.text);
        const last = blocks[blocks.length - 1];
        const gap = prev && prev.y !== null && l.y !== null ? Math.abs(prev.y - l.y) : 0;
        const startsNew =
            !last ||
            heading ||
            bullet ||
            last.type === "h" ||
            gap > Math.max(prev.size, l.size) * 1.9 ||
            Math.abs(l.size - prev.size) > 1;

        if (startsNew) {
            blocks.push({ type: heading ? "h" : "p", text: l.text });
        } else if (/[a-zà-ÿ]-$/i.test(last.text) && /^[a-zà-ÿ]/.test(l.text)) {
            // Mot coupé en fin de ligne : « ges- tion » devient « gestion ».
            last.text = last.text.slice(0, -1) + l.text;
        } else {
            last.text += ` ${l.text}`;
        }
        prev = l;
    });
    return blocks;
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Expression de recherche : insensible à la casse, espaces souples entre les mots.
export function searchRegExp(query) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return new RegExp(`(${words.map(escapeRegExp).join("\\s+")})`, "giu");
}

// Paragraphe avec surlignage : counter.n numérote les occurrences de la page dans l'ordre.
function Marked({ text, re, counter, activeIndex, activeRef }) {
    if (!re) return text;
    return text.split(re).map((part, i) => {
        if (i % 2 === 0) return part;
        const n = counter.n++;
        const active = n === activeIndex;
        return (
            <mark
                key={i}
                ref={active ? activeRef : undefined}
                // Couleurs fixes (le thème sombre redéfinit la palette) : surlignage clair, texte foncé.
                className={`rounded-sm px-0.5 text-[#0f172a] ${
                    active ? "bg-[#94a3b8] ring-2 ring-[#475569]" : "bg-[#fde68a]"
                }`}
            >
                {part}
            </mark>
        );
    });
}

const ReaderTextView = forwardRef(function ReaderTextView(
    { state, blocks, fontScale, query, activeIndex, onShowPdf },
    activeRef,
) {
    if (state === "loading") {
        return <p className="py-16 text-center text-sm text-slate-500">Préparation du texte…</p>;
    }
    if (state === "unavailable") {
        return (
            <div className="mx-auto max-w-md py-16 text-center">
                <p className="text-sm text-slate-600">
                    Le mode texte n'est pas disponible pour ce document : il ne contient pas de texte
                    exploitable (document scanné).
                </p>
                <button
                    type="button"
                    onClick={onShowPdf}
                    className="mt-4 inline-flex h-9 items-center rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    Revenir au mode PDF
                </button>
            </div>
        );
    }
    if (!blocks.length) {
        return (
            <p className="py-16 text-center text-sm text-slate-500">
                Cette page ne contient pas de texte (image ou page blanche). Elle reste visible en mode PDF.
            </p>
        );
    }

    const re = query ? searchRegExp(query) : null;
    const counter = { n: 0 };
    return (
        <article
            className="mx-auto max-w-[65ch] font-reading text-slate-900"
            style={{ fontSize: `${17 * fontScale}px`, lineHeight: 1.75 }}
        >
            {blocks.map((block, i) =>
                block.type === "h" ? (
                    <h3
                        key={i}
                        className="mb-3.5 mt-8 font-display text-[1.45em] font-semibold leading-tight tracking-tight first:mt-0"
                    >
                        <Marked text={block.text} re={re} counter={counter} activeIndex={activeIndex} activeRef={activeRef} />
                    </h3>
                ) : (
                    <p key={i} className="mb-[1.05em]">
                        <Marked text={block.text} re={re} counter={counter} activeIndex={activeIndex} activeRef={activeRef} />
                    </p>
                ),
            )}
        </article>
    );
});

export default ReaderTextView;
