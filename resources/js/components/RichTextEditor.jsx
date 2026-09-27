import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Undo2, Redo2 } from "lucide-react";

function ToolbarButton({ active, disabled, onClick, label, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                active
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-ink-soft hover:border-brass hover:text-ink"
            }`}
        >
            {children}
        </button>
    );
}

// Éditeur de texte enrichi minimal (gras, italique, listes) pour les champs de type résumé.
// Le HTML produit est rendu avec la classe partagée .rich-text (voir app.css) côté affichage public.
export default function RichTextEditor({ value, onChange }) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
            }),
        ],
        content: value || "",
        editorProps: {
            attributes: {
                class: "rich-text rte-content min-h-[6rem] px-3 py-2 text-sm text-ink focus:outline-none",
            },
        },
        onUpdate: ({ editor }) => {
            if (!editor.isDestroyed) onChange(editor.getHTML());
        },
    });

    // Garde l'éditeur synchronisé quand `value` change en dehors de lui (ex : chargement d'un document à modifier).
    // Un éditeur détruit (double montage de React en mode strict) ne doit plus être interrogé :
    // getHTML() y lève « Cannot read properties of null (reading 'cached') » et casse la page.
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const current = editor.getHTML();
        const next = value || "";
        if (next !== current) {
            editor.commands.setContent(next, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, editor]);

    if (!editor || editor.isDestroyed) return null;

    return (
        <div className="rte-shell overflow-hidden rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-indigo-200">
            <div className="rte-toolbar flex flex-wrap items-center gap-1 border-b border-line bg-paper-dim px-2 py-1.5">
                <ToolbarButton
                    label="Gras"
                    active={editor.isActive("bold")}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    <Bold className="h-4 w-4" strokeWidth={1.75} />
                </ToolbarButton>
                <ToolbarButton
                    label="Italique"
                    active={editor.isActive("italic")}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    <Italic className="h-4 w-4" strokeWidth={1.75} />
                </ToolbarButton>
                <span className="mx-1 h-5 w-px bg-line" />
                <ToolbarButton
                    label="Liste à puces"
                    active={editor.isActive("bulletList")}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                    <List className="h-4 w-4" strokeWidth={1.75} />
                </ToolbarButton>
                <ToolbarButton
                    label="Liste numérotée"
                    active={editor.isActive("orderedList")}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                    <ListOrdered className="h-4 w-4" strokeWidth={1.75} />
                </ToolbarButton>
                <span className="mx-1 h-5 w-px bg-line" />
                <ToolbarButton
                    label="Annuler"
                    disabled={!editor.can().undo()}
                    onClick={() => editor.chain().focus().undo().run()}
                >
                    <Undo2 className="h-4 w-4" strokeWidth={1.75} />
                </ToolbarButton>
                <ToolbarButton
                    label="Rétablir"
                    disabled={!editor.can().redo()}
                    onClick={() => editor.chain().focus().redo().run()}
                >
                    <Redo2 className="h-4 w-4" strokeWidth={1.75} />
                </ToolbarButton>
            </div>
            <EditorContent editor={editor} />
        </div>
    );
}
