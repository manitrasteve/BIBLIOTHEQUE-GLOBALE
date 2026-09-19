import { useEffect, useState } from "react";
import {
    Users,
    Trash2,
    UserX,
    UserCheck,
    UserPlus,
    X,
    Check,
} from "lucide-react";
import { api } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import CreateUserForm from "../../components/CreateUserForm";

// Petite modale de confirmation + saisie de raison, réutilisée pour
// la suppression et la désactivation.
function ReasonModal({ title, confirmLabel, danger, onCancel, onConfirm }) {
    const [step, setStep] = useState("confirm"); // 'confirm' | 'reason'
    const [reason, setReason] = useState("");
    const [sending, setSending] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                {step === "confirm" ? (
                    <>
                        <p className="mb-6 text-sm font-medium text-slate-800">
                            {title}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={onCancel}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                <X className="h-4 w-4" /> Annuler
                            </button>
                            <button
                                onClick={() => setStep("reason")}
                                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"}`}
                            >
                                <Check className="h-4 w-4" /> {confirmLabel}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="mb-3 text-sm font-medium text-slate-800">
                            {danger
                                ? "Envoyer votre raison de suppression du compte"
                                : "Entrer votre raison"}
                        </p>
                        <textarea
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-500"
                            placeholder="Expliquez la raison ici..."
                        />
                        <p className="mt-1 text-xs text-slate-400">
                            Cette raison sera envoyée par e-mail à
                            l'utilisateur.
                        </p>
                        <div className="mt-4 flex justify-end gap-3">
                            <button
                                onClick={onCancel}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Annuler
                            </button>
                            <button
                                disabled={!reason.trim() || sending}
                                onClick={async () => {
                                    setSending(true);
                                    await onConfirm(reason.trim());
                                    setSending(false);
                                }}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"}`}
                            >
                                {sending ? "Envoi..." : "Envoyer"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState(null);
    const [libraries, setLibraries] = useState([]);
    const [modal, setModal] = useState(null); // { type: 'delete'|'deactivate', user }
    const [showCreate, setShowCreate] = useState(false);
    const [query, setQuery] = useState("");

    function load() {
        api.getUsers()
            .then((r) => setUsers(r.data || []))
            .catch(() => {});
    }

    useEffect(() => {
        load();
        api.getLibraries()
            .then((r) => setLibraries(r.data || r || []))
            .catch(() => {});
    }, []);

    async function handleDelete(reason) {
        try {
            await api.deleteUser(modal.user.id, reason);
            setUsers((list) => list.filter((u) => u.id !== modal.user.id));
            setModal(null);
        } catch (err) {
            alert(err?.message || "Suppression impossible.");
            setModal(null);
        }
    }

    async function handleDeactivate(reason) {
        try {
            const updated = await api.deactivateUser(modal.user.id, reason);
            setUsers((list) =>
                list.map((u) => (u.id === modal.user.id ? updated : u)),
            );
            setModal(null);
        } catch (err) {
            alert(err?.message || "Désactivation impossible.");
            setModal(null);
        }
    }

    async function handleReactivate(user) {
        if (
            !confirm(
                `Réactiver le compte de ${user.name} ? Un e-mail lui sera envoyé pour créer son mot de passe.`,
            )
        )
            return;
        try {
            const updated = await api.reactivateUser(user.id);
            setUsers((list) =>
                list.map((u) => (u.id === user.id ? updated : u)),
            );
        } catch (err) {
            alert(err?.message || "Réactivation impossible.");
        }
    }

    const filteredUsers = (users || []).filter((u) =>
        matchesSearch(`${u.name} ${u.email} ${u.role} ${u.library?.name || ""}`, query),
    );

    if (showCreate) {
        return (
            <CreateUserForm
                libraries={libraries}
                onCancel={() => setShowCreate(false)}
                onCreated={(res) => {
                    setUsers((list) => [res.user, ...(list || [])]);
                    setShowCreate(false);
                }}
            />
        );
    }

    return (
        <div>
            <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <Users className="h-5 w-5 text-violet-600" /> Utilisateurs
                </h2>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                    <UserPlus className="h-4 w-4" /> Ajouter un utilisateur
                </button>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="mb-5 flex gap-2"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un utilisateur…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"/><button className="btn-primary"><Users className="h-4 w-4"/> Rechercher</button></form>

            {users === null ? (
                <p>Chargement…</p>
            ) : users.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucun utilisateur.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Utilisateur</th><th className="px-4 py-3 text-left">Rôle</th><th className="px-4 py-3 text-left">Bibliothèque</th><th className="px-4 py-3 text-left">Statut</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                        <tbody>{filteredUsers.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500">Aucun résultat.</td></tr>}{filteredUsers.map((u) => (
                            <tr key={u.id} className="border-t border-slate-100">
                                <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                                <td className="px-4 py-3">{u.role}</td><td className="px-4 py-3">{u.library?.name || "—"}</td>
                                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.is_active ? "Actif" : "En attente / désactivé"}</span></td>
                                <td className="px-4 py-3"><div className="flex justify-end gap-2">{u.is_active ? <button onClick={() => setModal({type:"deactivate",user:u})} className="btn-secondary"><UserX className="h-4 w-4"/>Désactiver</button> : <button onClick={() => handleReactivate(u)} className="btn-secondary"><UserCheck className="h-4 w-4"/>Réactiver</button>}{!['bibliothecaire','administrateur'].includes(u.role) && <button onClick={() => setModal({type:"delete",user:u})} title="Supprimer" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600"><Trash2 className="h-4 w-4"/></button>}</div></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}

            {modal?.type === "delete" && (
                <ReasonModal
                    title={`Êtes-vous sûr de supprimer ${modal.user.name} ?`}
                    confirmLabel="Confirmer"
                    danger
                    onCancel={() => setModal(null)}
                    onConfirm={handleDelete}
                />
            )}
            {modal?.type === "deactivate" && (
                <ReasonModal
                    title={`Êtes-vous sûr de désactiver le compte de ${modal.user.name} ?`}
                    confirmLabel="Oui"
                    onCancel={() => setModal(null)}
                    onConfirm={handleDeactivate}
                />
            )}
        </div>
    );
}
