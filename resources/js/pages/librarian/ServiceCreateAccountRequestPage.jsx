import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import CreateUserForm from "../../components/CreateUserForm";

// Ajout d'un utilisateur par le Bibliothécaire : même formulaire que celui de
// l'Administrateur (Administration → Utilisateurs), avec les droits du rôle :
// étudiants uniquement, et demande envoyée à l'administrateur pour validation
// (le backend reste la source de vérité). Bibliothèque Numérique Globale : la
// demande n'est plus rattachée à une bibliothèque particulière.
export default function ServiceCreateAccountRequestPage() {
    const navigate = useNavigate();
    const [notice, setNotice] = useState("");
    const [formKey, setFormKey] = useState(0);

    return (
        <CreateUserForm
            key={formKey}
            submitUser={(data) => api.createAccountRequestByLibrarian(data)}
            allowedRoles={["etudiant"]}
            requireLevel
            eyebrow="Service Numérique"
            subtitle="La demande sera transmise à l'administrateur, qui pourra la valider ou la rejeter."
            notice={notice}
            onCancel={() => navigate("/bibliothecaire/tableau-de-bord")}
            onCreated={(res) => {
                setNotice(
                    res?.message ||
                        "La demande de création de compte a été envoyée à l'administrateur.",
                );
                setFormKey((key) => key + 1);
            }}
        />
    );
}
