import { useEffect, useRef, useState } from "react";
import {
    FileText,
    Maximize2,
    ZoomIn,
    ZoomOut,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { sessionMemory } from "../lib/sessionMemory";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Lecteur PDF "sécurisé" : le document est dessiné page par page sur un
// <canvas> (jamais chargé comme un vrai fichier par le navigateur), donc
// aucun bouton natif Télécharger/Imprimer n'existe, sur aucun appareil —
// contrairement à un <iframe>, qui échoue silencieusement sur mobile.
export default function SecurePdfViewer({ slug }) {
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

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
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
                const doc = await pdfjsLib.getDocument({ data: buffer })
                    .promise;
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
        if (!pdf) return;
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
            } catch {
                // rendu annulé (page/zoom changé pendant le rendu) — sans danger
            }
        }

        render();
        return () => {
            cancelled = true;
        };
    }, [pdf, pageNum, zoom, availableWidth]);

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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-surface px-3 py-2">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={pageNum <= 1}
                        onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-slate-600">
                        Page {pageNum} / {numPages}
                    </span>
                    <button
                        type="button"
                        disabled={pageNum >= numPages}
                        onClick={() =>
                            setPageNum((p) => Math.min(numPages, p + 1))
                        }
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={fullscreen}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                        title="Plein écran"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-auto p-2 sm:p-4">
                <div className="mx-auto w-fit ">
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
            </div>
        </div>
    );
}
