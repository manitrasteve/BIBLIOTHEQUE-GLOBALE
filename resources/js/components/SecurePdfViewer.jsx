import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlignLeft,
    FileText,
    Maximize2,
    Minus,
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    Search,
    X,
} from "lucide-react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";
import ReaderTextView, { buildTextBlocks } from "./ReaderTextView";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Texte d'une page, en minuscules et aux espaces normalisés, avec pour chaque
// caractère l'élément de texte pdf.js d'origine (item) et sa position (offset) :
// cela permet de retrouver l'emplacement exact d'une occurrence sur la page.
function indexPageText(items) {
    let text = "";
    const map = [];
    const push = (c, item, offset) => {
        if (/\s/.test(c)) {
            if (text === "" || text.endsWith(" ")) return;
            c = " ";
        }
        text += c;
        map.push({ item, offset });
    };
    items.forEach((it, i) => {
        if (typeof it.str !== "string") return;
        for (let k = 0; k < it.str.length; k++) {
            for (const c of it.str[k].toLowerCase()) push(c, i, k);
        }
        if (it.hasEOL) push(" ", -1, 0);
    });
    return { items, text, map };
}

function normalizeQuery(q) {
    return q.trim().replace(/\s+/g, " ").toLowerCase();
}

// Préférences de lecture propres à ce navigateur (mode PDF / Texte, taille du texte).
function readPref(key, fallback) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function writePref(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // stockage indisponible (navigation privée) : la préférence vaut pour cette visite
    }
}

const TEXT_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];

// Lecteur PDF "sécurisé" : le document est dessiné page par page sur un
// <canvas> (jamais chargé comme un vrai fichier par le navigateur), donc
// aucun bouton natif Télécharger/Imprimer n'existe, sur aucun appareil —
// contrairement à un <iframe>, qui échoue silencieusement sur mobile.
// readerName / libraryName : filigrane « Compte lecteur : … · usage personnel uniquement ».
export default function SecurePdfViewer({ slug, readerName, libraryName }) {
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pdf, setPdf] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    // Zoom relatif à l'ajustement automatique à la largeur disponible (1 = page entière visible).
    const [zoom, setZoom] = useState(1);
    const [availableWidth, setAvailableWidth] = useState(0);

    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const scrollRef = useRef(null);
    const renderTaskRef = useRef(null);

    // Recherche dans le document ouvert : texte extrait localement par pdf.js, sans requête serveur.
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]); // { page, start, end }
    const [current, setCurrent] = useState(0);
    const [searchState, setSearchState] = useState("idle"); // idle | searching | done | notext
    const [pageViewport, setPageViewport] = useState(null); // { pageNum, viewport } en pixels CSS
    const textIndexRef = useRef(null); // Promise du texte indexé de toutes les pages
    const textPagesRef = useRef(null); // même contenu, une fois l'extraction terminée
    const pendingScrollRef = useRef(false);
    const activeHighlightRef = useRef(null);

    // Mode « Texte » : texte de la page remis en forme dans une colonne de lecture.
    const [mode, setMode] = useState(() => (readPref("reader_mode", "pdf") === "text" ? "text" : "pdf"));
    const [fontScale, setFontScale] = useState(() => {
        const saved = Number(readPref("reader_text_scale", 1));
        return TEXT_SCALES.includes(saved) ? saved : 1;
    });
    const [textView, setTextView] = useState({ state: "loading", pageNum: 0, blocks: [] });
    const activeTextRef = useRef(null);
    const [pageInput, setPageInput] = useState("1");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            // Nouveau document : aucune recherche précédente ne doit subsister.
            textIndexRef.current = null;
            textPagesRef.current = null;
            pendingScrollRef.current = false;
            setQuery("");
            setResults([]);
            setCurrent(0);
            setSearchState("idle");
            setPageViewport(null);
            setTextView({ state: "loading", pageNum: 0, blocks: [] });
            try {
                const token = localStorage.getItem("bm_token");
                const r = await fetch(api.streamDocumentUrl(slug), {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!r.ok) {
                    throw new Error(
                        r.status === 403
                            ? "Vous n'avez pas les droits nécessaires pour consulter ce document."
                            : "Impossible de charger le document.",
                    );
                }
                const buffer = await r.arrayBuffer();
                // Fichier corrompu ou qui n'est pas un vrai PDF : message lisible plutôt que l'erreur technique de pdf.js.
                const doc = await pdfjsLib.getDocument({ data: buffer }).promise.catch(() => {
                    throw new Error(
                        "Ce fichier PDF est endommagé ou illisible. Signalez-le au Service Numérique pour qu'il soit remplacé.",
                    );
                });
                if (cancelled) return;
                const saved = sessionMemory.getReaderPage(slug);
                setPdf(doc);
                setNumPages(doc.numPages);
                setPageNum(
                    Number.isInteger(saved) && saved >= 1 && saved <= doc.numPages
                        ? saved
                        : 1,
                );
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [slug]);

    useEffect(() => {
        if (pdf) {
            sessionMemory.setReaderPage(slug, pageNum);
            sessionMemory.setReaderTotal(slug, pdf.numPages);
        }
    }, [pdf, pageNum]);

    // Largeur utile de la zone de lecture (hors marges), mise à jour à la rotation / redimensionnement.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;

        const measure = () => {
            const style = getComputedStyle(el);
            const padding =
                parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
            setAvailableWidth(Math.max(0, el.clientWidth - padding));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [loading, error]);

    useEffect(() => {
        if (!pdf || mode !== "pdf") return;
        let cancelled = false;

        async function render() {
            const page = await pdf.getPage(pageNum);
            if (cancelled) return;
            const canvas = canvasRef.current;
            if (!canvas) return;

            // Ajuste la page à la largeur disponible puis applique le zoom ; le canvas est
            // dessiné en pixels réels de l'écran (netteté) et affiché à la taille CSS voulue.
            const baseWidth = page.getViewport({ scale: 1 }).width;
            const fit = availableWidth > 0 ? availableWidth / baseWidth : 1.1;
            const cssScale = fit * zoom;
            const pixelRatio = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: cssScale * pixelRatio });

            if (renderTaskRef.current) renderTaskRef.current.cancel();
            const ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width / pixelRatio}px`;
            canvas.style.height = `${viewport.height / pixelRatio}px`;

            const task = page.render({ canvasContext: ctx, viewport });
            renderTaskRef.current = task;
            try {
                await task.promise;
                if (!cancelled) {
                    setPageViewport({
                        pageNum,
                        viewport: page.getViewport({ scale: cssScale }),
                    });
                }
            } catch {
                // rendu annulé (page/zoom changé pendant le rendu) — sans danger
            }
        }

        render();
        return () => {
            cancelled = true;
        };
    }, [pdf, pageNum, zoom, availableWidth, mode]);

    // Extraction du texte de toutes les pages, une seule fois par document ouvert.
    function getTextIndex() {
        if (!textIndexRef.current) {
            const doc = pdf;
            const promise = (async () => {
                const pages = [];
                for (let n = 1; n <= doc.numPages; n++) {
                    const page = await doc.getPage(n);
                    const content = await page.getTextContent();
                    pages.push(indexPageText(content.items));
                }
                return pages;
            })();
            textIndexRef.current = promise;
            promise.then(
                (pages) => {
                    if (textIndexRef.current === promise) textPagesRef.current = pages;
                },
                () => {
                    if (textIndexRef.current === promise) textIndexRef.current = null;
                },
            );
        }
        return textIndexRef.current;
    }

    // Recherche, avec un court délai pour ne pas relancer le calcul à chaque frappe.
    useEffect(() => {
        const q = normalizeQuery(query);
        if (!pdf || !q) {
            pendingScrollRef.current = false;
            setResults([]);
            setCurrent(0);
            setSearchState("idle");
            return undefined;
        }
        let cancelled = false;
        setSearchState("searching");
        const timer = setTimeout(async () => {
            let pages;
            try {
                pages = await getTextIndex();
            } catch {
                pages = [];
            }
            if (cancelled) return;
            // Aucun texte exploitable (PDF scanné) : la recherche est impossible sans OCR.
            if (!pages.some((p) => p.text.trim() !== "")) {
                setResults([]);
                setCurrent(0);
                setSearchState("notext");
                return;
            }
            const found = [];
            pages.forEach((p, i) => {
                let at = p.text.indexOf(q);
                while (at !== -1) {
                    found.push({ page: i + 1, start: at, end: at + q.length });
                    at = p.text.indexOf(q, at + q.length);
                }
            });
            // Première occurrence à partir de la page affichée, sinon depuis le début.
            const first = found.findIndex((r) => r.page >= pageNum);
            pendingScrollRef.current = found.length > 0;
            setResults(found);
            setCurrent(first === -1 ? 0 : first);
            setSearchState("done");
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // pageNum volontairement absent : changer de page ne relance pas la recherche.
    }, [pdf, query]);

    function goToResult(index) {
        if (!results.length) return;
        setCurrent((index + results.length) % results.length);
        pendingScrollRef.current = true;
    }

    // Affiche la page de l'occurrence sélectionnée.
    const selected = results[current];
    useEffect(() => {
        if (selected && pendingScrollRef.current && selected.page !== pageNum) {
            setPageNum(selected.page);
        }
    }, [selected]);

    // Rectangles de surlignage des occurrences de la page affichée (pixels CSS du canvas).
    const highlights = useMemo(() => {
        const pages = textPagesRef.current;
        if (!results.length || !pageViewport || !pages) return [];
        const shown = pageViewport.pageNum;
        const pageIndex = pages[shown - 1];
        if (!pageIndex) return [];
        const { viewport } = pageViewport;
        const rects = [];
        results.forEach((r, ri) => {
            if (r.page !== shown) return;
            // Une occurrence peut s'étendre sur plusieurs éléments de texte (ex. plusieurs lignes).
            const spans = new Map();
            for (let c = r.start; c < r.end; c++) {
                const m = pageIndex.map[c];
                if (!m || m.item < 0) continue;
                const s = spans.get(m.item);
                if (s) {
                    s.from = Math.min(s.from, m.offset);
                    s.to = Math.max(s.to, m.offset + 1);
                } else {
                    spans.set(m.item, { from: m.offset, to: m.offset + 1 });
                }
            }
            spans.forEach(({ from, to }, itemIdx) => {
                const it = pageIndex.items[itemIdx];
                const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
                const height = Math.hypot(tx[2], tx[3]);
                const width = it.width * viewport.scale;
                const len = it.str.length || 1;
                rects.push({
                    key: `${ri}-${itemIdx}`,
                    active: ri === current,
                    left: tx[4] + (width * from) / len,
                    top: tx[5] - height,
                    width: Math.max(2, (width * (to - from)) / len),
                    height: height * 1.2,
                });
            });
        });
        return rects;
    }, [results, current, pageViewport]);

    // Fait défiler la zone de lecture jusqu'à l'occurrence sélectionnée.
    useEffect(() => {
        if (!pendingScrollRef.current || !selected) return;
        if (!pageViewport || pageViewport.pageNum !== selected.page) return;
        const el = activeHighlightRef.current;
        const box = scrollRef.current;
        if (!el || !box) return;
        pendingScrollRef.current = false;
        const a = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        box.scrollBy({
            top: a.top - b.top - (b.height - a.height) / 2,
            left:
                a.left < b.left || a.right > b.right
                    ? a.left - b.left - (b.width - a.width) / 2
                    : 0,
            behavior: "smooth",
        });
    }, [highlights]);

    function onSearchKeyDown(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            goToResult(current + (e.shiftKey ? -1 : 1));
        } else if (e.key === "Escape") {
            setQuery("");
        }
    }


    // Mode Texte : met en forme le texte de la page affichée (extrait une seule fois par document).
    useEffect(() => {
        if (!pdf || mode !== "text") return undefined;
        let cancelled = false;
        setTextView((v) =>
            v.state === "ready" && v.pageNum === pageNum ? v : { state: "loading", pageNum, blocks: [] },
        );
        getTextIndex()
            .then((pages) => {
                if (cancelled) return;
                if (!pages.some((p) => p.text.trim() !== "")) {
                    setTextView({ state: "unavailable", pageNum, blocks: [] });
                    return;
                }
                setTextView({ state: "ready", pageNum, blocks: buildTextBlocks(pages[pageNum - 1]?.items || []) });
                // Nouvelle page : on repart du haut (sauf si une recherche va y faire défiler).
                if (!pendingScrollRef.current) scrollRef.current?.scrollTo({ top: 0 });
            })
            .catch(() => !cancelled && setTextView({ state: "unavailable", pageNum, blocks: [] }));
        return () => {
            cancelled = true;
        };
    }, [pdf, mode, pageNum]);

    // Occurrence sélectionnée parmi celles de la page affichée (mode Texte).
    const activeTextIndex =
        selected && selected.page === pageNum
            ? results.slice(0, current).filter((r) => r.page === pageNum).length
            : -1;

    // Mode Texte : fait défiler jusqu'à l'occurrence sélectionnée.
    useEffect(() => {
        if (mode !== "text" || !pendingScrollRef.current || !selected) return;
        if (textView.state !== "ready" || textView.pageNum !== selected.page) return;
        const el = activeTextRef.current;
        const box = scrollRef.current;
        if (!el || !box) return;
        pendingScrollRef.current = false;
        const a = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        box.scrollBy({ top: a.top - b.top - (b.height - a.height) / 2, behavior: "smooth" });
    }, [mode, textView, current, results]);

    // Nouvelle page : la lecture reprend en haut (sauf si une recherche va faire défiler jusqu'au mot trouvé).
    useEffect(() => {
        setPageInput(String(pageNum));
        if (!pendingScrollRef.current) scrollRef.current?.scrollTo({ top: 0, left: 0 });
    }, [pageNum]);

    function goToPage(n) {
        if (!Number.isFinite(n) || !numPages) return;
        setPageNum(Math.min(numPages, Math.max(1, Math.round(n))));
    }

    function commitPageInput() {
        const n = parseInt(pageInput, 10);
        if (Number.isFinite(n)) goToPage(n);
        else setPageInput(String(pageNum));
    }

    function changeMode(next) {
        setMode(next);
        writePref("reader_mode", next);
    }

    // Zoom de la page en mode PDF ; taille du texte en mode Texte.
    function changeZoom(direction) {
        if (mode === "text") {
            setFontScale((s) => {
                const i = TEXT_SCALES.indexOf(s);
                const next = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, i + direction))];
                writePref("reader_text_scale", next);
                return next;
            });
        } else {
            setZoom((z) => (direction > 0 ? Math.min(3, z + 0.25) : Math.max(0.5, z - 0.25)));
        }
    }

    // Raccourcis : ← → pour changer de page, + et − pour le zoom (hors saisie de texte).
    useEffect(() => {
        function onKey(e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
            if (e.key === "ArrowLeft") setPageNum((p) => Math.max(1, p - 1));
            else if (e.key === "ArrowRight") setPageNum((p) => Math.min(numPages, p + 1));
            else if (e.key === "+" || e.key === "=") changeZoom(1);
            else if (e.key === "-") changeZoom(-1);
            else return;
            e.preventDefault();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [numPages, mode]);

    function fullscreen() {
        containerRef.current?.requestFullscreen?.();
    }

    if (error) {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="reader-panel-height flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-surface">
                <FileText className="h-6 w-6 text-slate-400" />
                <p className="text-sm text-slate-500">
                    Chargement du document…
                </p>
            </div>
        );
    }

    const pillButton =
        "flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent";
    const zoomLabel = `${Math.round((mode === "text" ? fontScale : zoom) * 100)} %`;
    const watermark = [
        readerName ? `Compte lecteur : ${readerName}` : null,
        libraryName || null,
        "usage personnel uniquement",
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div
            ref={containerRef}
            className="reader-panel-height relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            onContextMenu={(e) => e.preventDefault()}
            style={{
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
            }}
        >
            {/* Barre du haut : mode, recherche, zoom, plein écran */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-surface px-3 py-2">
                <div className="flex items-center rounded-full border border-slate-200 bg-surface p-0.5" role="group" aria-label="Mode d'affichage">
                    {[
                        { key: "pdf", label: "PDF", Icon: FileText, title: "Afficher la page du PDF" },
                        { key: "text", label: "Texte", Icon: AlignLeft, title: "Lire le texte de la page, mis en forme" },
                    ].map(({ key, label, Icon, title }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => changeMode(key)}
                            aria-pressed={mode === key}
                            title={title}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                                mode === key ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-brass-deep"
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                <div className="order-last flex w-full min-w-0 items-center gap-1 sm:order-none sm:w-auto sm:max-w-md sm:flex-1">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder="Rechercher dans le document…"
                            aria-label="Rechercher dans le document"
                            className="h-9 w-full rounded-full border border-slate-200 bg-surface pl-8 pr-8 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-brass [&::-webkit-search-cancel-button]:hidden"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                                title="Effacer la recherche"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    {searchState !== "idle" && (
                        <span
                            className="max-w-[45%] shrink-0 truncate text-xs text-slate-600 sm:max-w-[12rem]"
                            aria-live="polite"
                            title={
                                searchState === "notext"
                                    ? "La recherche de texte n'est pas disponible pour ce document."
                                    : undefined
                            }
                        >
                            {searchState === "searching"
                                ? "Recherche…"
                                : searchState === "notext"
                                  ? "La recherche de texte n'est pas disponible pour ce document."
                                  : results.length
                                    ? `${current + 1} / ${results.length}`
                                    : "Aucun résultat trouvé"}
                        </span>
                    )}
                    {searchState === "done" && results.length > 0 && (
                        <div className="flex shrink-0 items-center rounded-full border border-slate-200 p-0.5">
                            <button type="button" onClick={() => goToResult(current - 1)} className={pillButton} title="Résultat précédent">
                                <ChevronUp className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => goToResult(current + 1)} className={pillButton} title="Résultat suivant">
                                <ChevronDown className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center rounded-full border border-slate-200 bg-surface p-0.5" role="group" aria-label={mode === "text" ? "Taille du texte" : "Zoom"}>
                        <button
                            type="button"
                            onClick={() => changeZoom(-1)}
                            disabled={mode === "text" ? fontScale <= TEXT_SCALES[0] : zoom <= 0.5}
                            className={`${pillButton} text-xs font-bold`}
                            aria-label={mode === "text" ? "Réduire le texte" : "Zoom arrière"}
                            title={mode === "text" ? "Réduire le texte (−)" : "Zoom arrière (−)"}
                        >
                            {mode === "text" ? "A−" : <Minus className="h-4 w-4" />}
                        </button>
                        <span className="w-12 text-center text-xs font-medium tabular-nums text-slate-600">{zoomLabel}</span>
                        <button
                            type="button"
                            onClick={() => changeZoom(1)}
                            disabled={mode === "text" ? fontScale >= TEXT_SCALES[TEXT_SCALES.length - 1] : zoom >= 3}
                            className={`${pillButton} text-xs font-bold`}
                            aria-label={mode === "text" ? "Agrandir le texte" : "Zoom avant"}
                            title={mode === "text" ? "Agrandir le texte (+)" : "Zoom avant (+)"}
                        >
                            {mode === "text" ? "A+" : <Plus className="h-4 w-4" />}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={fullscreen}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
                        title="Plein écran"
                        aria-label="Plein écran"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Page */}
            <div
                ref={scrollRef}
                className={`flex-1 overflow-auto ${mode === "text" ? "bg-surface px-5 py-8 sm:px-10 sm:py-10" : "p-3 sm:p-6"}`}
            >
                {mode === "text" ? (
                    <ReaderTextView
                        ref={activeTextRef}
                        state={textView.pageNum === pageNum ? textView.state : "loading"}
                        blocks={textView.pageNum === pageNum ? textView.blocks : []}
                        fontScale={fontScale}
                        query={searchState === "done" && results.length ? query : ""}
                        activeIndex={activeTextIndex}
                        onShowPdf={() => changeMode("pdf")}
                    />
                ) : (
                    <div className="relative mx-auto w-fit bg-[#ffffff] outline outline-slate-200">
                        {pageViewport?.pageNum === pageNum &&
                            highlights.map((h) => (
                                <div
                                    key={h.key}
                                    ref={h.active ? activeHighlightRef : undefined}
                                    className={`pointer-events-none absolute z-10 rounded-sm mix-blend-multiply ${
                                        h.active
                                            ? "bg-slate-400/60 ring-2 ring-slate-600"
                                            : "bg-yellow-300/60"
                                    }`}
                                    style={{
                                        left: h.left,
                                        top: h.top,
                                        width: h.width,
                                        height: h.height,
                                    }}
                                />
                            ))}
                        <canvas
                            ref={canvasRef}
                            onContextMenu={(e) => e.preventDefault()}
                            onTouchStart={(e) => {
                                if (e.touches.length > 1) e.preventDefault();
                            }}
                            style={{
                                touchAction: "pan-x pan-y pinch-zoom",
                                display: "block",
                            }}
                        />
                    </div>
                )}
                <p className="mx-auto mt-5 max-w-[65ch] text-center text-xs text-slate-500">{watermark}</p>
            </div>

            {/* Barre du bas : pagination */}
            <nav className="flex items-center justify-center gap-3 border-t border-slate-200 bg-surface px-3 py-2 text-sm text-slate-600" aria-label="Pagination du document">
                <button
                    type="button"
                    disabled={pageNum <= 1}
                    onClick={() => goToPage(pageNum - 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Page précédente"
                    title="Page précédente (←)"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <label className="flex items-center gap-2">
                    Page
                    <input
                        type="text"
                        inputMode="numeric"
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                commitPageInput();
                                e.currentTarget.blur();
                            }
                        }}
                        onBlur={commitPageInput}
                        aria-label="Numéro de page"
                        className="h-8 w-12 rounded-lg border border-slate-200 bg-surface text-center font-semibold tabular-nums text-slate-900 outline-none focus:border-brass"
                    />
                    <span className="whitespace-nowrap">sur {numPages}</span>
                </label>
                <button
                    type="button"
                    disabled={pageNum >= numPages}
                    onClick={() => goToPage(pageNum + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Page suivante"
                    title="Page suivante (→)"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </nav>
        </div>
    );
}
