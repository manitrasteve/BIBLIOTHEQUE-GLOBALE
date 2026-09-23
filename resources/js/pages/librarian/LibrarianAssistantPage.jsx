import { Sparkles } from "lucide-react";
import ManagementAssistantChat from "../../components/ManagementAssistantChat";
import { api } from "../../lib/api";
import { sessionMemory } from "../../lib/sessionMemory";

const EXAMPLES = [
    "Combien de documents avons-nous ?",
    "Combien de documents sont en brouillon ?",
    "Quels documents ont été archivés aujourd'hui ?",
    "Combien de bibliothécaires y a-t-il au total ?",
    "Quel est mon historique complet ?",
    "Quelles actions ai-je effectuées aujourd'hui ?",
    "Qui a modifié le dernier document publié ?",
    "Avons-nous des livres d'informatique ?",
];

export default function LibrarianAssistantPage() {
    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-6">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                    <Sparkles className="h-5 w-5 text-brass" strokeWidth={1.75} />
                    Assistant IA de gestion
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                    Interrogez l'assistant sur les documents, les bibliothèques et l'historique des actions. Les réponses proviennent des données réelles de la plateforme.
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
