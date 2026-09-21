import { Sparkles } from "lucide-react";
import ManagementAssistantChat from "../../components/ManagementAssistantChat";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { sessionMemory } from "../../lib/sessionMemory";

const EXAMPLES = [
    "Combien de documents avons-nous ?",
    "Combien de documents sont en brouillon ?",
    "Quels documents ont été archivés aujourd'hui ?",
    "Combien de bibliothécaires y a-t-il dans ma bibliothèque ?",
    "Quel est mon historique complet ?",
    "Quelles actions ai-je effectuées aujourd'hui ?",
    "Qui a modifié le dernier document publié ?",
    "Avons-nous des livres d'informatique ?",
];

export default function LibrarianAssistantPage() {
    const { user } = useAuth();
    const library = user?.library?.name;

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-6">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                    <Sparkles className="h-5 w-5 text-brass" strokeWidth={1.75} />
                    Assistant IA de gestion
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                    Interrogez l'assistant sur les documents et l'historique des actions{library ? <> de votre bibliothèque (<strong>{library}</strong>)</> : " de votre bibliothèque"}. Les autres bibliothèques ne sont pas accessibles.
                </p>
            </div>

            <ManagementAssistantChat
                ask={api.askLibrarianAssistant}
                memory={() => sessionMemory.getManagementChat("librarian")}
                setMemory={(m) => sessionMemory.setManagementChat("librarian", m)}
                examples={EXAMPLES}
                placeholder="Ex. : Quels documents ont été modifiés aujourd'hui ?"
            />
        </div>
    );
}
