import { useEffect, useState } from "react";
import {
    Users,
    Trash2,
    UserX,
    UserCheck,
    UserPlus,
    X,
    Check,
    Mail,
    Phone,
    User,
    Home as HomeIcon,
    UserRound,
    Send,
    Building2,
    ShieldCheck,
} from "lucide-react";
import { api } from "../../lib/api";
import { matchesSearch } from "../../lib/search";

const ROLES = [
    { value: "etudiant", label: "Étudiant" },
    { value: "enseignant", label: "Enseignant" },
    { value: "chercheur", label: "Chercheur" },
    { value: "bibliothecaire", label: "Bibliothécaire" },
    { value: "administrateur", label: "Administrateur" },
];

const STUDENT_CENTERS = [
    "IOSTM", "IUGM", "ISSTM", "IUTAM", "ILCSS",
    "Faculté de Médecine",
    "Faculté des sciences, technologies et de l'environnement (FSTE)",
    "Ecoles et formations rattachées",
];
const STUDENT_LEVELS = ["L1", "L2", "L3", "M1", "M2", "Doctorat"];

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

// Champ de saisie avec icône, même style que le formulaire public
// "C'est ma première fois" (CreateAccountFormPage), pour que l'admin
// retrouve exactement le même scénario visuel.
function Field({
    id,
    label,
    icon: Icon,
    form,
    update,
    type = "text",
    required = true,
    placeholder,
}) {
    return (
        <div>
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-semibold text-slate-700"
            >
                {label}
            </label>

            <div className="relative">
                <Icon
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                />

                <input
                    id={id}
                    name={id}
                    type={type}
                    required={required}
                    value={form[id]}
                    onChange={update(id)}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-10 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                />
            </div>
        </div>
    );
}

function StudentAdminFields({ form, update, setForm, step }) {
    const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
    const labelClass = "block text-sm font-semibold text-slate-700 dark:text-slate-200";

    if (step === 1) return <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>Nom *<input required value={form.last_name} onChange={update("last_name")} className={inputClass} /></label>
        <label className={labelClass}>Prénom<input value={form.first_name} onChange={update("first_name")} className={inputClass} /></label>
        <label className={labelClass}>Né(e), le *<input required type="date" value={form.date_of_birth} onChange={update("date_of_birth")} className={inputClass} /></label>
        <label className={labelClass}>Lieu de naissance *<input required value={form.birth_place} onChange={update("birth_place")} className={inputClass} /></label>
        <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-600"><legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Genre *</legend><div className="flex gap-5 pt-1">{[["masculin", "Masculin"], ["feminin", "Féminin"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm dark:text-slate-200"><input required type="radio" name="admin-gender" value={value} checked={form.gender === value} onChange={update("gender")} />{label}</label>)}</div></fieldset>
        <label className={labelClass}>CIN n° *<input required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} placeholder="Taper le n° de CIN à 12 chiffres" value={form.cin_number} onChange={(event) => setForm((current) => ({ ...current, cin_number: event.target.value.replace(/\D/g, "").slice(0, 12) }))} className={inputClass} /></label>
        <label className={labelClass}>Délivré le *<input required type="date" value={form.cin_issued_at} onChange={update("cin_issued_at")} className={inputClass} /></label>
        <label className={labelClass}>Adresse *<input required value={form.address} onChange={update("address")} className={inputClass} /></label>
        <label className={labelClass}>Téléphone *<input required type="tel" value={form.phone} onChange={update("phone")} className={inputClass} /></label>
        <label className={`${labelClass} md:col-span-2`}>Adresse E-mail *<input required type="email" value={form.email} onChange={update("email")} className={inputClass} /></label>
    </div>;

    return <div className="space-y-6">
        <fieldset><legend className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Quel est votre centre ? *</legend><p className="mb-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Instituts</p><div className="grid gap-2 md:grid-cols-2">{STUDENT_CENTERS.slice(0, 5).map((center) => <label key={center} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-600 dark:text-slate-200"><input required type="radio" name="admin-school" value={center} checked={form.school === center} onChange={update("school")} />{center}</label>)}</div><p className="mb-2 mt-4 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Facultés</p><div className="grid gap-2 md:grid-cols-2">{STUDENT_CENTERS.slice(5).map((center) => <label key={center} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-600 dark:text-slate-200"><input required type="radio" name="admin-school" value={center} checked={form.school === center} onChange={update("school")} />{center}</label>)}</div></fieldset>
        <div className="grid gap-5 md:grid-cols-2"><label className={labelClass}>Filière *<input required value={form.filiere} onChange={update("filiere")} className={inputClass} /></label><label className={labelClass}>N° de carte d'étudiant *<input required value={form.student_card_number} onChange={update("student_card_number")} className={inputClass} /></label></div>
        <fieldset><legend className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Niveau</legend><div className="flex flex-wrap gap-4">{STUDENT_LEVELS.map((level) => <label key={level} className="flex items-center gap-2 text-sm dark:text-slate-200"><input type="radio" name="niveau_detail" value={level} checked={form.niveau_detail === level} onChange={update("niveau_detail")} />{level}</label>)}</div></fieldset>
    </div>;
}

function CreateUserForm({ libraries, onCancel, onCreated }) {
    const [form, setForm] = useState({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        gender: "",
        address: "",
        role: "etudiant",
        date_of_birth: "",
        birth_place: "",
        cin_number: "",
        cin_issued_at: "",
        student_card_number: "",
        school: "",
        filiere: "",
        niveau_type: "Université",
        niveau_detail: "",
        faculty: "",
        department: "",
        position: "",
        teaching_specialty: "",
        research_lab: "",
        researcher_field: "",
        specialty: "",
        profession: "",
        library_id: "",
    });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [studentStep, setStudentStep] = useState(1);
    const studentStepOneValid = Boolean(
        form.library_id && form.last_name.trim() && form.date_of_birth &&
        form.birth_place.trim() && form.gender && /^\d{12}$/.test(form.cin_number) &&
        form.cin_issued_at && form.address.trim() && form.phone.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email),
    );
    const studentStepTwoValid = Boolean(
        form.school && form.filiere.trim() && form.student_card_number.trim(),
    );
    const update = (k) => (e) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));
    async function submit(e) {
        e.preventDefault();
        if (form.role === "etudiant" && studentStep === 1) {
            if (studentStepOneValid) setStudentStep(2);
            return;
        }
        if (form.role === "etudiant" && !studentStepTwoValid) return;
        setError("");
        setSaving(true);
        try {
            const res = await api.createUserByAdmin(form);
            onCreated(res.user);
        } catch (err) {
            const errors = err?.data?.errors;
            setError(
                errors
                    ? Object.values(errors)[0]?.[0]
                    : err?.data?.message ||
                          err?.message ||
                          "Impossible de créer l'utilisateur.",
            );
        } finally {
            setSaving(false);
        }
    }
    const field = (id, label, type = "text", required = false) => (
        <Field
            id={id}
            label={label}
            icon={
                id.includes("email")
                    ? Mail
                    : id.includes("phone")
                      ? Phone
                      : id.includes("address")
                        ? HomeIcon
                        : User
            }
            form={form}
            update={update}
            type={type}
            required={required}
        />
    );
    return (
        <div className="w-full py-4">
            <div className="w-full">
                <div className="mb-4">
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">
                        Gestion des utilisateurs
                    </p>
                    <h1 className="font-display text-3xl font-extrabold text-slate-900">
                        Ajouter un utilisateur
                    </h1>
                    <p className="mt-3 text-sm text-slate-600">
                        Sélectionnez un rôle. Seul le formulaire correspondant
                        sera affiché.
                    </p>
                </div>
                <form
                    onSubmit={submit}
                    className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                >
                    {error && (
                        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    <div className="mb-7">
                        <label className="mb-2 block text-sm font-bold text-slate-700">Bibliothèque</label>
                        <select value={form.library_id} onChange={update("library_id")} required className="mb-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                            <option value="">Sélectionner une bibliothèque</option>
                            {libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}
                        </select>
                        <span className="mb-3 block text-sm font-bold text-slate-700">
                            Rôle
                        </span>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                { value: "etudiant", label: "Étudiant" },
                                { value: "enseignant", label: "Enseignant" },
                                { value: "chercheur", label: "Chercheur" },
                            ].map((r) => (
                                <label
                                    key={r.value}
                                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 font-semibold ${form.role === r.value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200"}`}
                                >
                                    <input
                                        type="radio"
                                        name="admin-role"
                                        checked={form.role === r.value}
                                        onChange={() =>
                                            setForm((f) => ({
                                                ...f,
                                                role: r.value,
                                            }))
                                        }
                                    />
                                    {r.label}
                                </label>
                            ))}
                        </div>
                    </div>
                    {form.role === "etudiant" ? (
                        <StudentAdminFields
                            form={form}
                            update={update}
                            setForm={setForm}
                            step={studentStep}
                        />
                    ) : (
                    <div className="grid gap-5 md:grid-cols-2">
                        {field("last_name", "Nom", "text", true)}
                        {field("first_name", "Prénom")}
                        {field("email", "Adresse e-mail", "email", true)}
                        {field("phone", "Numéro de téléphone", "tel", true)}
                        {field("address", "Adresse", "text", true)}
                        <div>
                            <span className="mb-2 block text-sm font-semibold text-slate-700">Genre *</span>
                            <div className="flex gap-4 pt-2">
                                {[['masculin', 'Masculin'], ['feminin', 'Féminin']].map(([value, label]) => (
                                    <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                                        <input type="radio" name="admin-gender" value={value} checked={form.gender === value} onChange={update("gender")} required />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                Date de naissance
                            </label>
                            <input
                                type="date"
                                value={form.date_of_birth}
                                onChange={update("date_of_birth")}
                                className="w-full rounded-xl border border-slate-200 px-4 py-3"
                            />
                        </div>
                        {form.role === "enseignant" && (
                            <>
                                {field(
                                    "faculty",
                                    "Faculté / Institut",
                                    "text",
                                    true,
                                )}
                                {field(
                                    "department",
                                    "Département",
                                    "text",
                                    true,
                                )}
                                {field(
                                    "position",
                                    "Fonction / Grade",
                                    "text",
                                    true,
                                )}
                                {field(
                                    "teaching_specialty",
                                    "Spécialité / Domaine d'enseignement",
                                    "text",
                                    true,
                                )}
                            </>
                        )}
                        {form.role === "chercheur" && (
                            <>
                                {field(
                                    "faculty",
                                    "Institution / Faculté",
                                    "text",
                                    true,
                                )}
                                {field(
                                    "research_lab",
                                    "Laboratoire / Centre de recherche",
                                    "text",
                                    true,
                                )}
                                {field(
                                    "researcher_field",
                                    "Domaine de recherche",
                                    "text",
                                    true,
                                )}
                                {field("specialty", "Spécialité", "text", true)}
                                {field("profession", "Fonction / Statut")}
                            </>
                        )}
                    </div>
                    )}
                    <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="btn-secondary"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-primary"
                        >
                            <Send className="h-4 w-4" />
                            {saving ? "Création…" : form.role === "etudiant" && studentStep === 1 ? "Suivant" : "Créer le compte"}
                        </button>
                    </div>
                </form>
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
                onCreated={(user) => {
                    setUsers((list) => [user, ...(list || [])]);
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
