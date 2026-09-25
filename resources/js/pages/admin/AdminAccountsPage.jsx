import { useEffect, useState } from "react";
import { CheckCircle2, UserX, Users, GraduationCap } from "lucide-react";
import { api } from "../../lib/api";
import StatusBadge from "../../components/StatusBadge";

const ROLE_LABELS = {
    etudiant: "Étudiant",
    enseignant: "Enseignant",
    chercheur: "Chercheur",
    autre: "Autre",
    bibliothecaire: "Bibliothécaire",
    administrateur: "Administrateur",
};

export default function AdminAccountsPage() {
    const [users, setUsers] = useState(null);
    const [showAll, setShowAll] = useState(false);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        load();
    }, [showAll]);

    function load() {
        api.getUsers(showAll ? {} : { is_active: false })
            .then((res) => setUsers(res.data))
            .catch(() => setError("Impossible de charger les comptes."));
    }

    async function activate(user) {
        setBusyId(user.id);
        try {
            await api.activateUser(user.id);
            load();
        } finally {
            setBusyId(null);
        }
    }

    async function deactivate(user) {
        if (!confirm(`Désactiver le compte de ${user.name} ?`)) return;
        const reason = prompt("Raison de la désactivation :");
        if (!reason) return;
        setBusyId(user.id);
        try {
            await api.deactivateUser(user.id, reason);
            load();
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <h2 className="flex items-center gap-2 font-display text-xl text-ink">
                    <Users className="h-5 w-5 text-brass" strokeWidth={1.75} />
                    {showAll
                        ? "Tous les comptes"
                        : "Comptes en attente de validation"}
                </h2>
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="text-sm text-brass hover:text-brass-deep"
                >
                    {showAll
                        ? "Voir seulement les comptes en attente"
                        : "Voir tous les comptes"}
                </button>
            </div>

            {error && <p className="text-red-700 mb-4">{error}</p>}

            {users === null ? (
                <p className="text-ink-soft">Chargement…</p>
            ) : users.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-10 text-center">
                    <GraduationCap
                        className="h-6 w-6 mx-auto text-slate-400 mb-2"
                        strokeWidth={1.5}
                    />
                    <p className="text-ink-soft text-sm">
                        {showAll
                            ? "Aucun compte trouvé."
                            : "Aucun compte en attente de validation."}
                    </p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {users.map((u) => (
                        <li
                            key={u.id}
                            className="rounded-xl border border-line bg-paper p-4 flex items-center justify-between gap-4"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="flex-shrink-0 h-9 w-9 rounded-full bg-paper-dim flex items-center justify-center text-ink-soft text-sm font-display">
                                    {u.name?.[0]?.toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-ink font-medium truncate">
                                        {u.name}
                                    </p>
                                    <p className="text-xs text-ink-soft mt-0.5 truncate">
                                        {u.email} ·{" "}
                                        {ROLE_LABELS[u.role] || u.role} ·{" "}
                                        {u.library?.name || "Sans bibliothèque"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <StatusBadge
                                    status={
                                        u.is_active ? "actif" : "en_attente"
                                    }
                                />
                                {u.is_active ? (
                                    <button
                                        onClick={() => deactivate(u)}
                                        disabled={busyId === u.id}
                                        className="flex items-center gap-1.5 text-sm text-red-700 hover:text-red-800 disabled:opacity-50"
                                    >
                                        <UserX
                                            className="h-3.5 w-3.5"
                                            strokeWidth={1.75}
                                        />
                                        Désactiver
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => activate(u)}
                                        disabled={busyId === u.id}
                                        className="flex items-center gap-1.5 text-sm text-brass hover:text-brass-deep disabled:opacity-50"
                                    >
                                        <CheckCircle2
                                            className="h-3.5 w-3.5"
                                            strokeWidth={1.75}
                                        />
                                        Valider
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
