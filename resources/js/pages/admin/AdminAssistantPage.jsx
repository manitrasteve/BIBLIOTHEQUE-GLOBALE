import { Sparkles } from "lucide-react";
import ManagementAssistantChat from "../../components/ManagementAssistantChat";
import { api } from "../../lib/api";
import { sessionMemory } from "../../lib/sessionMemory";

const EXAMPLES = [
    "Combien de documents avons-nous ?",
    "Combien de documents sont en brouillon ?",
    "Avons-nous des livres d'informatique ?",
    "Quels documents ont été archivés aujourd'hui ?",
    "Quelle bibliothèque a été créée récemment ?",
    "Quelles actions les bibliothécaires ont-ils effectuées aujourd'hui ?",
];

export default function AdminAssistantPage() {
    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-6">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                    <Sparkles className="h-5 w-5 text-brass" strokeWidth={1.75} />
                    Assistant IA de gestion
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                    Interrogez l'assistant sur les documents, les bibliothèques, les comptes et l'historique des actions. Les réponses proviennent des données réelles de la plateforme.
                </p>
            </div>

            <ManagementAssistantChat
                ask={api.askAdminAssistant}
                memory={() => sessionMemory.getManagementChat("admin")}
                setMemory={(m) => sessionMemory.setManagementChat("admin", m)}
                examples={EXAMPLES}
                placeholder="Ex. : Qui a publié le livre Algorithmique ?"
            />
        </div>
    );
}
