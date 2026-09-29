import { useEffect, useState } from "react";
import { Pencil, StickyNote, Trash2, X } from "lucide-react";
import { api } from "../lib/api";

// Couleurs d'étiquette d'une note (mêmes clés que DocumentNote::COLORS côté serveur).
export const NOTE_COLORS = {
    jaune: { label: "Jaune", dot: "bg-yellow-400" },
    vert: { label: "Vert", dot: "bg-emerald-500" },
    bleu: { label: "Bleu", dot: "bg-sky-500" },
    rose: { label: "Rose", dot: "bg-rose-500" },
};

// Notes personnelles du lecteur, rattachées aux pages du document (visibles de lui seul).
// notes / setNotes viennent du lecteur, qui s'en sert aussi pour signaler les pages annotées.
export default function ReaderNotesPanel({ slug, pageNum, notes, setNotes, onGoToPage, onClose }) {
    const [body, setBody] = useState("");
    const [color, setColor] = useState("jaune");
    const [editing, setEditing] = useState(null); // { id, body }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Nouvelle page : l'erreur éventuelle de la page précédente disparaît.
    useEffect(() => {
        setError(null);
    }, [pageNum]);

    async function addNote(e) {
        e.preventDefault();
        const text = body.trim();
        if (!text) return;
        setBusy(true);
        setError(null);
        try {
            const note = await api.createDocumentNote(slug, { page: pageNum, body: text, color });
            setNotes((list) => [...list, note].sort((a, b) => a.page - b.page || a.id - b.id));
            setBody("");
        } catch (err) {
            setError(err?.data?.message || "La note n'a pas pu être enregistrée.");
        } finally {
            setBusy(false);
        }
    }

    async function saveEdit(note) {
        const text = editing.body.trim();
        if (!text) return;
        try {
            const saved = await api.updateDocumentNote(note.id, { body: text });
            setNotes((list) => list.map((n) => (n.id === note.id ? saved : n)));
            setEditing(null);
        } catch (err) {
            setError(err?.data?.message || "La note n'a pas pu être modifiée.");
        }
    }

    async function remove(note) {
        if (!window.confirm("Supprimer cette note ?")) return;
        try {
            await api.deleteDocumentNote(note.id);
            setNotes((list) => list.filter((n) => n.id !== note.id));
        } catch {
            setError("La note n'a pas pu être supprimée.");
        }
    }

    return (
        <aside
            aria-label="Mes notes"
            // Le lecteur bloque la sélection (protection du PDF) ; les notes, elles, restent éditables normalement.
            style={{ userSelect: "text", WebkitUserSelect: "text" }}
            className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-slate-200 bg-surface"
        >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <StickyNote className="h-4 w-4 text-brass" aria-hidden="true" />
                    Mes notes
                    <span className="text-xs font-normal text-slate-500">({notes.length})</span>
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                    aria-label="Fermer les notes"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <form onSubmit={addNote} className="space-y-2 border-b border-slate-200 p-4">
                <label htmlFor="reader-note" className="text-xs font-semibold text-slate-700">
                    Nouvelle note — page {pageNum}
                </label>
                <textarea
                    id="reader-note"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    placeholder="Idée, citation à retenir, question…"
                    className="w-full resize-y rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brass"
                />
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Couleur de la note">
                        {Object.entries(NOTE_COLORS).map(([key, c]) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={color === key}
                                aria-label={c.label}
                                title={c.label}
                                onClick={() => setColor(key)}
                                className={`h-6 w-6 rounded-full ${c.dot} ${color === key ? "ring-2 ring-slate-700 ring-offset-2" : ""}`}
                            />
                        ))}
                    </div>
                    <button type="submit" disabled={busy || !body.trim()} className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
                        Ajouter
                    </button>
                </div>
                {error && <p className="text-xs text-rose-700" role="alert">{error}</p>}
            </form>

            <ol className="flex-1 space-y-2 overflow-y-auto p-4">
                {notes.length === 0 && (
                    <li className="text-center text-xs text-slate-500">
                        Aucune note pour l'instant. Vos notes ne sont visibles que par vous.
                    </li>
                )}
                {notes.map((note) => (
                    <li
                        key={note.id}
                        className={`rounded-lg border p-3 ${note.page === pageNum ? "border-brass bg-indigo-50" : "border-slate-200"}`}
                    >
                        <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${NOTE_COLORS[note.color]?.dot || NOTE_COLORS.jaune.dot}`} aria-hidden="true" />
                            <button
                                type="button"
                                onClick={() => onGoToPage(note.page)}
                                className="text-xs font-semibold text-brass hover:underline"
                            >
                                Page {note.page}
                            </button>
                            <div className="ml-auto flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setEditing({ id: note.id, body: note.body })}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                    aria-label={`Modifier la note de la page ${note.page}`}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => remove(note)}
                                    className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                    aria-label={`Supprimer la note de la page ${note.page}`}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        {editing?.id === note.id ? (
                            <div className="mt-2 space-y-2">
                                <textarea
                                    value={editing.body}
                                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                                    rows={3}
                                    maxLength={5000}
                                    aria-label="Texte de la note"
                                    className="w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
                                />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setEditing(null)} className="btn-secondary !px-3 !py-1 text-xs">
                                        Annuler
                                    </button>
                                    <button type="button" onClick={() => saveEdit(note)} className="btn-primary !px-3 !py-1 text-xs">
                                        Enregistrer
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-800">{note.body}</p>
                        )}
                    </li>
                ))}
            </ol>
        </aside>
    );
}
