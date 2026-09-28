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
import { sortRows } from "../../lib/sort";
import CreateUserForm from "../../components/CreateUserForm";
import CounterBar from "../../components/CounterBar";
import Pager from "../../components/Pager";
import DetailModal, { ViewButton } from "../../components/DetailModal";
import SortTh from "../../components/SortTh";
import ActionsTh from "../../components/ActionsTh";
import { GLOBAL_LIBRARY, ROLES, userSections } from "../../lib/detailSections";

function getUserVal(row, key) {
    if (key === "status") return row.is_active ? 1 : 0;
    return row[key];
}

// Petite modale de confirmation + saisie de raison, réutilisée pour
// la suppression et la désactivation.
function ReasonModal({ title, confirmLabel, danger, onCancel, onConfirm }) {
    const [step, setStep] = useState("confirm"); // 'confirm' | 'reason'
    const [reason, setReason] = useState("");
    const [sending, setSending] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
            <div className="w-full max-w-md rounded-2xl bg-surface p-4 ">
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
                                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-700"}`}
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
                            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brass"
                            placeholder="Expliquez la raison ici..."
                        />
                        <p className="mt-1 text-xs text-slate-500">
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
                                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-700"}`}
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
    const [modal, setModal] = useState(null); // { type: 'delete'|'deactivate', user }
    const [showCreate, setShowCreate] = useState(false);
    const [query, setQuery] = useState("");
    const [viewing, setViewing] = useState(null);
    const [counts, setCounts] = useState(null);

    const [meta, setMeta] = useState(null);
    const [sort, setSort] = useState({ key: null, dir: "asc" });
    // Colonne « Actions » du tableau : boutons cachés au départ, affichés / cachés par un clic sur l'en-tête.
    const [showActions, setShowActions] = useState(false);
    const [error, setError] = useState(null);
    // Résultat de la dernière création : e-mail du lien envoyé ou non.
    const [notice, setNotice] = useState(null);

    // Le serveur pagine (20 par page) : les actions rechargent la page courante.
    function load(page = meta?.current_page || 1) {
        setError(null);
        api.getUsers({ page })
            .then((r) => {
                // Dernier utilisateur d'une page supprimé : retour à la page précédente.
                if (!(r.data || []).length && page > 1) return load(page - 1);
                setUsers(r.data || []);
                setCounts(r.counts || null);
                setMeta({ current_page: r.current_page, last_page: r.last_page, total: r.total });
            })
            .catch((requestError) => setError(requestError?.data?.message || "Impossible de charger les utilisateurs."));
    }

    useEffect(() => {
        load();
    }, []);

    async function handleDelete(reason) {
        try {
            await api.deleteUser(modal.user.id, reason);
            setUsers((list) => list.filter((u) => u.id !== modal.user.id));
            setModal(null);
            load(); // compteurs à jour
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
            load(); // compteurs à jour
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
            load(); // compteurs à jour
        } catch (err) {
            alert(err?.message || "Réactivation impossible.");
        }
    }

    const filteredUsers = sortRows(
        (users || []).filter((u) =>
            matchesSearch(`${u.name} ${u.email} ${u.role} ${GLOBAL_LIBRARY}`, query),
        ),
        sort,
        getUserVal,
    );

    if (showCreate) {
        return (
            <CreateUserForm
                onCancel={() => setShowCreate(false)}
                onCreated={(res) => {
                    setUsers((list) => [res.user, ...(list || [])]);
                    setNotice(res.message ? { text: res.message, warning: res.mail_sent === false } : null);
                    setShowCreate(false);
                    load(); // compteurs à jour
                }}
            />
        );
    }

    return (
        <div>
            <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <Users className="h-5 w-5 text-brass" /> Utilisateurs
                </h2>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <UserPlus className="h-4 w-4" /> Ajouter un utilisateur
                </button>
            </div>

            <CounterBar
                total={counts?.total}
                items={counts ? [
                    { label: "Étudiants", value: counts.etudiant },
                    { label: "Enseignants", value: counts.enseignant },
                    { label: "Chercheurs", value: counts.chercheur },
                    { label: "Actifs", value: counts.actifs },
                    { label: "En attente / désactivés", value: counts.inactifs },
                ] : []}
            />

            <form onSubmit={(e) => e.preventDefault()} className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un utilisateur…" className="min-w-0 w-full sm:max-w-[600px] sm:flex-1 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm"/><button className="btn-primary w-full sm:w-auto sm:shrink-0"><Users className="h-4 w-4"/> Rechercher</button></form>

            {notice && (
                <div
                    role={notice.warning ? "alert" : "status"}
                    className={`mb-4 flex items-start justify-between gap-3 rounded-xl border p-3 text-sm font-medium ${
                        notice.warning ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                >
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Fermer le message" className="shrink-0 font-bold">
                        ×
                    </button>
                </div>
            )}

            {error && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    <span>{error}</span>
                    <button onClick={() => load()} className="btn-secondary shrink-0">Réessayer</button>
                </div>
            )}

            {users === null ? (
                error ? null : <p>Chargement…</p>
            ) : users.length === 0 ? (
                <div className="modern-card p-10 text-center text-slate-500">
                    Aucun utilisateur.
                </div>
            ) : (
                <>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-surface sm:block">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50"><tr><SortTh label="Utilisateur" sortKey="name" sort={sort} setSort={setSort}/><SortTh label="Rôle" sortKey="role" sort={sort} setSort={setSort}/><th className="px-4 py-3 text-left">Bibliothèque</th><SortTh label="Statut" sortKey="status" sort={sort} setSort={setSort}/><ActionsTh open={showActions} onToggle={() => setShowActions((v) => !v)} /></tr></thead>
                        <tbody>{filteredUsers.length === 0 && <tr><td colSpan="5" className="p-5 text-center text-slate-500">Aucun résultat.</td></tr>}{filteredUsers.map((u) => (
                            <tr key={u.id} className="border-t border-slate-100">
                                <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                                <td className="px-4 py-3">{ROLES[u.role] || u.role}</td><td className="px-4 py-3">{GLOBAL_LIBRARY}</td>
                                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.is_active ? "Actif" : "En attente / désactivé"}</span></td>
                                <td className="px-4 py-3">{showActions && <div className="flex justify-end gap-2"><ViewButton onClick={() => setViewing(u)} />{u.is_active ? <button onClick={() => setModal({type:"deactivate",user:u})} className="btn-secondary"><UserX className="h-4 w-4"/>Désactiver</button> : <button onClick={() => handleReactivate(u)} className="btn-secondary"><UserCheck className="h-4 w-4"/>Réactiver</button>}{!['bibliothecaire','administrateur'].includes(u.role) && <button onClick={() => setModal({type:"delete",user:u})} title="Supprimer" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-700"><Trash2 className="h-4 w-4"/></button>}</div>}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
                <div className="space-y-3 sm:hidden">
                    {filteredUsers.length === 0 && <div className="rounded-2xl border border-slate-200 bg-surface p-5 text-center text-slate-500">Aucun résultat.</div>}
                    {filteredUsers.map((u) => (
                        <div key={u.id} className="rounded-2xl border border-slate-200 bg-surface p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><p className="font-semibold break-words">{u.name}</p><p className="text-xs text-slate-500 break-words">{u.email}</p></div>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.is_active ? "Actif" : "En attente / désactivé"}</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Rôle : {ROLES[u.role] || u.role}</p>
                            <p className="mt-1 text-xs text-slate-500">Bibliothèque : {GLOBAL_LIBRARY}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <ViewButton onClick={() => setViewing(u)} />
                                {u.is_active ? <button onClick={() => setModal({type:"deactivate",user:u})} className="btn-secondary"><UserX className="h-4 w-4"/>Désactiver</button> : <button onClick={() => handleReactivate(u)} className="btn-secondary"><UserCheck className="h-4 w-4"/>Réactiver</button>}
                                {!['bibliothecaire','administrateur'].includes(u.role) && <button onClick={() => setModal({type:"delete",user:u})} title="Supprimer" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-700"><Trash2 className="h-4 w-4"/></button>}
                            </div>
                        </div>
                    ))}
                </div>
                </>
            )}

            <Pager meta={meta} onChange={(p) => load(p)} />

            {viewing && (
                <DetailModal
                    title={viewing.name}
                    subtitle={viewing.email}
                    sections={userSections(viewing)}
                    onClose={() => setViewing(null)}
                />
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
