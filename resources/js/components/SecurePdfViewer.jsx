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
    const [scale, setScale] = useState(1.1);

    const canvasRef = useRef(null);
    const containerRef = useRef(null);
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
                setPdf(doc);
                setNumPages(doc.numPages);
                setPageNum(1);
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
        if (!pdf) return;
        let cancelled = false;

        async function render() {
            const page = await pdf.getPage(pageNum);
            if (cancelled) return;
            const viewport = page.getViewport({ scale });
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            if (renderTaskRef.current) renderTaskRef.current.cancel();
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
    }, [pdf, pageNum, scale]);

    function fullscreen() {
        containerRef.current?.requestFullscreen?.();
    }

    if (error) {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
                {error}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white">
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
            className="relative flex h-[82vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            onContextMenu={(e) => e.preventDefault()}
            style={{
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
            }}
        >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
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
                        onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setScale((s) => Math.min(3, s + 0.15))}
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

            <div className="flex-1 overflow-auto p-4">
                <div className="mx-auto w-fit shadow-lg">
                    <canvas
                        ref={canvasRef}
                        onContextMenu={(e) => e.preventDefault()}
                        onTouchStart={(e) => {
                            if (e.touches.length > 1) e.preventDefault();
                        }}
                        style={{
                            touchAction: "pan-y pinch-zoom",
                            display: "block",
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
