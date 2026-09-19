import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import CreateUserForm from "../../components/CreateUserForm";

// Ajout d'un utilisateur par le Bibliothécaire : même formulaire que celui de
// l'Administrateur (Administration → Utilisateurs), avec les droits du rôle :
// étudiants uniquement, dans sa propre bibliothèque, et demande envoyée à
// l'administrateur pour validation (le backend reste la source de vérité).
export default function ServiceCreateAccountRequestPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [libraries, setLibraries] = useState([]);
    const [notice, setNotice] = useState("");
    const [formKey, setFormKey] = useState(0);

    useEffect(() => {
        api.getLibraries()
            .then((r) => setLibraries(r.data || r || []))
            .catch(() => {});
    }, []);

    return (
        <CreateUserForm
            key={formKey}
            libraries={libraries}
            submitUser={(data) => api.createAccountRequestByLibrarian(data)}
            allowedRoles={["etudiant"]}
            lockedLibraryId={user?.library_id}
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
