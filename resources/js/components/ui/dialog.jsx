import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

export function Dialog({ open, onOpenChange, children }) {
 useEffect(() => {
 if (!open) return;
 const handler = (event) => event.key === "Escape" && onOpenChange?.(false);
 document.addEventListener("keydown", handler);
 return () => document.removeEventListener("keydown", handler);
 }, [open, onOpenChange]);
 if (!open) return null;
 return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">{children}</div>;
}
export function DialogContent({ className, children, onClose }) {
 const ref = useRef(null);
 return <><div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" /><div ref={ref} className={cn("relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-surface p-5 text-slate-900", className)}>{children}</div></>;
}
export function DialogHeader({ className, ...props }) { return <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />; }
export function DialogTitle({ className, ...props }) { return <h2 className={cn("text-base font-semibold", className)} {...props} />; }
export function DialogDescription({ className, ...props }) { return <p className={cn("text-xs text-slate-500", className)} {...props} />; }
export function DialogFooter({ className, ...props }) { return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />; }
