import { useState } from "react";
import { Check, Copy, Quote } from "lucide-react";
import { CITATION_STYLES } from "../lib/citation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

// « Citer ce document » : référence prête à copier (APA 7, ISO 690, BibTeX).
export default function CitationDialog({ doc }) {
    const [open, setOpen] = useState(false);
    const [style, setStyle] = useState("apa");
    const [copied, setCopied] = useState(false);
    const current = CITATION_STYLES.find((s) => s.key === style);
    const text = current.format(doc);

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ink hover:border-brass hover:text-brass transition-colors"
            >
                <Quote className="h-3.5 w-3.5" aria-hidden="true" />
                Citer ce document
            </button>

            <Dialog open={open} onOpenChange={setOpen} labelledBy="citation-title">
                <DialogContent onClose={() => setOpen(false)}>
                    <DialogHeader>
                        <DialogTitle id="citation-title">Citer ce document</DialogTitle>
                        <DialogDescription>
                            Référence générée à partir des informations du catalogue : vérifiez-la avant de l'utiliser.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4 flex gap-1 rounded-full border border-slate-200 p-0.5 w-fit" role="tablist" aria-label="Style de citation">
                        {CITATION_STYLES.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                role="tab"
                                aria-selected={style === s.key}
                                onClick={() => {
                                    setStyle(s.key);
                                    setCopied(false);
                                }}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                    style === s.key ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-brass-deep"
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <pre
                        className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800"
                        style={{ userSelect: "text" }}
                        aria-live="polite"
                    >
                        {text}
                    </pre>

                    <DialogFooter>
                        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">
                            Fermer
                        </button>
                        <button type="button" onClick={copy} className="btn-primary text-xs">
                            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                            {copied ? "Copiée" : "Copier"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
