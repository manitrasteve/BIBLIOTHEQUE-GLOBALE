import { useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "./Toast";

// Bouton « Exporter (Excel) » des listes d'administration : `onExport` lance le téléchargement.
export default function ExportButton({ onExport, label = "Exporter (Excel)" }) {
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    async function run() {
        setBusy(true);
        try {
            await onExport();
        } catch {
            toast("L’export n’a pas pu être téléchargé. Réessayez.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <button type="button" onClick={run} disabled={busy} className="btn-secondary disabled:opacity-50">
            <Download className={`h-4 w-4 ${busy ? "animate-bounce" : ""}`} />
            {busy ? "Export…" : label}
        </button>
    );
}
