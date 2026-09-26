import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Accessibilité : à l'ouverture le focus entre dans la fenêtre, Tab y reste (piège de focus),
// Échap la ferme, et à la fermeture le focus revient sur l'élément qui l'avait ouverte.
export function Dialog({ open, onOpenChange, children, labelledBy }) {
 const boxRef = useRef(null);
 // Via une ref : un onOpenChange recréé à chaque rendu ne doit pas relancer l'effet (le focus sauterait).
 const onOpenChangeRef = useRef(onOpenChange);
 onOpenChangeRef.current = onOpenChange;
 useEffect(() => {
 if (!open) return;
 const previous = document.activeElement;
 const box = boxRef.current;
 const focusables = () => [...(box?.querySelectorAll(FOCUSABLE) || [])];
 (focusables()[0] || box)?.focus();
 const handler = (event) => {
 if (event.key === "Escape") return onOpenChangeRef.current?.(false);
 if (event.key !== "Tab") return;
 const items = focusables();
 if (!items.length) return event.preventDefault();
 const first = items[0], last = items[items.length - 1];
 if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
 else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
 };
 document.addEventListener("keydown", handler);
 return () => { document.removeEventListener("keydown", handler); previous?.focus?.(); };
 }, [open]);
 if (!open) return null;
 return <div ref={boxRef} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>;
}
export function DialogContent({ className, children, onClose }) {
 const ref = useRef(null);
 return <><div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" /><div ref={ref} className={cn("relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-surface p-5 text-slate-900", className)}>{children}</div></>;
}
export function DialogHeader({ className, ...props }) { return <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />; }
export function DialogTitle({ className, ...props }) { return <h2 className={cn("text-base font-semibold", className)} {...props} />; }
export function DialogDescription({ className, ...props }) { return <p className={cn("text-xs text-slate-500", className)} {...props} />; }
export function DialogFooter({ className, ...props }) { return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />; }
