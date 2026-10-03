import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

// Fenêtre de confirmation « Oui / Non » : « Oui » lance l'opération, « Non » (ou Échap, ou un clic à côté) l'annule.
// `reasonLabel` : demande en plus un motif obligatoire (ex. rejet, envoyé au demandeur), transmis à onConfirm.
export default function ConfirmDialog({
    title,
    message,
    confirmLabel = "Oui",
    cancelLabel = "Non, annuler",
    danger = false,
    reasonLabel,
    busy = false,
    onConfirm,
    onCancel,
}) {
    const [reason, setReason] = useState("");

    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && !busy && onCancel();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy, onCancel]);

    const Icon = danger ? AlertTriangle : CheckCircle2;
    const canConfirm = !busy && (!reasonLabel || reason.trim() !== "");

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-label={title}
                className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-ink shadow-2xl"
            >
                <div className="flex items-start gap-4">
                    <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            danger ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                    >
                        <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-display text-lg font-extrabold">{title}</h3>
                        {message && <p className="mt-1 text-sm text-ink-soft">{message}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        aria-label="Fermer"
                        className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {reasonLabel && (
                    <label className="mt-5 block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">{reasonLabel}</span>
                        <textarea
                            autoFocus
                            rows={3}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            disabled={busy}
                            placeholder="Expliquez la raison ici…"
                            className="w-full rounded-xl border border-slate-200 bg-surface p-3 text-sm outline-none focus:border-brass"
                        />
                    </label>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary disabled:opacity-50">
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(reason.trim())}
                        disabled={!canConfirm}
                        className={`disabled:opacity-50 ${
                            danger
                                ? "inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-90"
                                : "btn-primary"
                        }`}
                    >
                        {busy ? "Traitement…" : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
