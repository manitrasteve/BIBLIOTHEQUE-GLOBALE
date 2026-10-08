import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SIZE = 48;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Bouton flottant « Haut de page » : l'anneau et le pourcentage suivent le défilement de la page.
// Visible seulement une fois la page un peu défilée.
export default function ScrollProgressButton() {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let frame = 0;
        function update() {
            frame = 0;
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const y = window.scrollY;
            setProgress(max > 0 ? Math.min(100, Math.max(0, Math.round((y / max) * 100))) : 0);
            setVisible(max > 0 && y > 200);
        }
        function onScroll() {
            if (!frame) frame = requestAnimationFrame(update);
        }
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        // Le contenu chargé à la demande change la hauteur de la page sans défilement.
        const observer = new ResizeObserver(onScroll);
        observer.observe(document.body);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            observer.disconnect();
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    function scrollToTop() {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }

    return (
        <button
            type="button"
            onClick={scrollToTop}
            aria-label={`Revenir en haut de la page (${progress} % parcourus)`}
            title="Haut de page"
            tabIndex={visible ? 0 : -1}
            aria-hidden={!visible}
            className={`fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-indigo-600 transition-all duration-200 hover:bg-indigo-50 print:hidden ${
                visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
            }`}
        >
            <svg className="absolute inset-0 -rotate-90" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
                <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-line)" strokeWidth={STROKE} />
                <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE * (1 - progress / 100)}
                />
            </svg>
            <span className="relative flex flex-col items-center leading-none">
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="mt-0.5 text-[9px] font-bold text-ink">{progress} %</span>
            </span>
        </button>
    );
}
