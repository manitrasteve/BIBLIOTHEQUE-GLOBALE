import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { PREVIEW_MESSAGE, PREVIEW_READY } from "../../lib/homepage";

const DEVICES = {
    desktop: { width: 1280, label: "Ordinateur", icon: Monitor },
    tablet: { width: 768, label: "Tablette", icon: Tablet },
    mobile: { width: 390, label: "Mobile", icon: Smartphone },
};

/**
 * Aperçu en direct : la vraie page d'accueil (/apercu-page-accueil) dans un iframe, réduite à la
 * largeur du panneau pour simuler un écran d'ordinateur, de tablette ou de mobile.
 * Les sections sont transmises par postMessage (même origine) : rien n'est enregistré ni publié.
 */
export default function HomepagePreviewFrame({ sections, label }) {
    const boxRef = useRef(null);
    const frameRef = useRef(null);
    const [device, setDevice] = useState("desktop");
    const [box, setBox] = useState({ width: 0, height: 0 });
    const [ready, setReady] = useState(0); // incrémenté à chaque chargement de l'aperçu

    useEffect(() => {
        const observer = new ResizeObserver(([entry]) =>
            setBox({ width: entry.contentRect.width, height: entry.contentRect.height }),
        );
        observer.observe(boxRef.current);
        return () => observer.disconnect();
    }, []);

    // L'aperçu signale qu'il est prêt (au chargement et à chaque rechargement de l'iframe).
    useEffect(() => {
        function onMessage(event) {
            if (
                event.origin === window.location.origin &&
                event.source === frameRef.current?.contentWindow &&
                event.data?.type === PREVIEW_READY
            ) {
                setReady((value) => value + 1);
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    useEffect(() => {
        if (!ready) return;
        frameRef.current?.contentWindow?.postMessage({ type: PREVIEW_MESSAGE, sections, label }, window.location.origin);
    }, [sections, label, ready]);

    const width = DEVICES[device].width;
    const scale = box.width ? Math.min(1, box.width / width) : 1;
    const offset = Math.max(0, (box.width - width * scale) / 2);

    return (
        <div className="flex h-full flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-700">Aperçu</p>
                <div className="flex rounded-lg border border-slate-200 bg-surface p-0.5" role="group" aria-label="Taille d'écran de l'aperçu">
                    {Object.entries(DEVICES).map(([key, { label: deviceLabel, icon: Icon }]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setDevice(key)}
                            aria-pressed={device === key}
                            title={deviceLabel}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                                device === key ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="hidden sm:inline">{deviceLabel}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div ref={boxRef} className="relative min-h-[480px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <iframe
                    ref={frameRef}
                    src="/apercu-page-accueil"
                    title="Aperçu de la page d'accueil"
                    className="absolute left-0 top-0 border-0 bg-surface"
                    style={{
                        width,
                        height: box.height / scale || "100%",
                        transform: `translateX(${offset}px) scale(${scale})`,
                        transformOrigin: "top left",
                    }}
                />
            </div>
        </div>
    );
}
