import { useState } from "react";
import { Mail, Phone, User, Home as HomeIcon, Send } from "lucide-react";
import { api } from "../lib/api";
import { isAdult, isCompleteBirthDate } from "../lib/age";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const STUDENT_CENTERS = [
    "IOSTM", "IUGM", "ISSTM", "IUTAM", "ILCSS",
    "Faculté de Médecine",
    "Faculté des sciences, technologies et de l'environnement (FSTE)",
    "Ecoles et formations rattachées",
];
const STUDENT_LEVELS = ["L1", "L2", "L3", "M1", "M2", "Doctorat"];

const ALL_ROLES = [
    { value: "etudiant", label: "Étudiant" },
    { value: "enseignant", label: "Enseignant" },
    { value: "chercheur", label: "Chercheur" },
];

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
            <Label htmlFor={id} className="mb-1.5 block text-xs">
                {label}{required ? " *" : ""}
            </Label>

            <div className="relative">
                <Icon
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                />

                <Input
                    id={id}
                    name={id}
                    type={type}
                    required={required}
                    value={form[id]}
                    onChange={update(id)}
                    placeholder={placeholder}
                    className="h-9 pl-10"
                />
            </div>
        </div>
    );
}

function StudentAdminFields({ form, update, setForm, step, requireLevel }) {
    // La CIN n'est demandée (et obligatoire) qu'à partir de 18 ans ; en dessous, elle est effacée.
    const adult = isAdult(form.date_of_birth);
    const updateBirthDate = (event) => {
        const value = event.target.value;
        setForm((current) => ({
            ...current,
            date_of_birth: value,
            ...(isAdult(value) ? {} : { cin_number: "", cin_issued_at: "" }),
        }));
    };

    const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-900 outline-none focus:border-brass focus:ring-2 focus:ring-indigo-200";
    const labelClass = "block text-sm font-semibold text-slate-700";

    if (step === 1) return <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>Nom *<input required value={form.last_name} onChange={update("last_name")} className={inputClass} /></label>
        <label className={labelClass}>Prénom<input value={form.first_name} onChange={update("first_name")} className={inputClass} /></label>
        <label className={labelClass}>Né(e), le *<input required type="date" value={form.date_of_birth} onChange={updateBirthDate} className={inputClass} /></label>
        <label className={labelClass}>Lieu de naissance *<input required value={form.birth_place} onChange={update("birth_place")} className={inputClass} /></label>
        <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold text-slate-700">Genre *</legend><div className="flex gap-5 pt-1">{[["masculin", "Masculin"], ["feminin", "Féminin"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input required type="radio" name="admin-gender" value={value} checked={form.gender === value} onChange={update("gender")} />{label}</label>)}</div></fieldset>
        {adult ? <>
            <label className={labelClass}>CIN n° *<input required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} placeholder="Taper le n° de CIN à 12 chiffres" value={form.cin_number} onChange={(event) => setForm((current) => ({ ...current, cin_number: event.target.value.replace(/\D/g, "").slice(0, 12) }))} className={inputClass} /></label>
            <label className={labelClass}>Délivré le *<input required type="date" value={form.cin_issued_at} onChange={update("cin_issued_at")} className={inputClass} /></label>
        </> : isCompleteBirthDate(form.date_of_birth) && (
            <p className="self-end rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2">
                Moins de 18 ans : la CIN n'est pas demandée.
            </p>
        )}
        <label className={labelClass}>Adresse E-mail *<input required type="email" value={form.email} onChange={update("email")} className={inputClass} /></label>
        <label className={labelClass}>Téléphone *<input required type="tel" value={form.phone} onChange={update("phone")} className={inputClass} /></label>
        <label className={`${labelClass} md:col-span-2`}>Adresse *<input required value={form.address} onChange={update("address")} className={inputClass} /></label>
    </div>;

    return <div className="space-y-6">
        <fieldset><legend className="mb-3 text-sm font-semibold text-slate-700">Quel est votre établissement ? *</legend><p className="mb-2 text-xs font-bold uppercase text-slate-500">Instituts</p><div className="grid gap-2 md:grid-cols-2">{STUDENT_CENTERS.slice(0, 5).map((center) => <label key={center} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input required type="radio" name="admin-school" value={center} checked={form.school === center} onChange={update("school")} />{center}</label>)}</div><p className="mb-2 mt-4 text-xs font-bold uppercase text-slate-500">Facultés</p><div className="grid gap-2 md:grid-cols-2">{STUDENT_CENTERS.slice(5).map((center) => <label key={center} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input required type="radio" name="admin-school" value={center} checked={form.school === center} onChange={update("school")} />{center}</label>)}</div></fieldset>
        <div className="grid gap-5 md:grid-cols-2"><label className={labelClass}>Parcours *<input required value={form.filiere} onChange={update("filiere")} className={inputClass} /></label><label className={labelClass}>N° de carte d'étudiant *<input required value={form.student_card_number} onChange={update("student_card_number")} className={inputClass} /></label></div>
        <fieldset><legend className="mb-3 text-sm font-semibold text-slate-700">Niveau{requireLevel ? " *" : ""}</legend><div className="flex flex-wrap gap-4">{STUDENT_LEVELS.map((level) => <label key={level} className="flex items-center gap-2 text-sm"><input type="radio" required={requireLevel} name="niveau_detail" value={level} checked={form.niveau_detail === level} onChange={update("niveau_detail")} />{level}</label>)}</div></fieldset>
    </div>;
}

// Formulaire d'ajout d'utilisateur, partagé entre l'Administrateur (référence)
// et le Bibliothécaire. Le contexte fournit l'appel API, les rôles autorisés,
// la bibliothèque imposée et les textes ; l'interface reste identique.
export default function CreateUserForm({
    onCancel,
    onCreated,
    submitUser = (data) => api.createUserByAdmin(data),
    allowedRoles = ALL_ROLES.map((role) => role.value),
    requireLevel = false,
    eyebrow = "Gestion des utilisateurs",
    subtitle = "Sélectionnez un rôle. Seul le formulaire correspondant sera affiché.",
    notice = "",
}) {
    const roles = ALL_ROLES.filter((role) => allowedRoles.includes(role.value));
    const [form, setForm] = useState({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        gender: "",
        address: "",
        role: roles[0]?.value ?? "etudiant",
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
    });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [studentStep, setStudentStep] = useState(1);
    const studentStepOneValid = Boolean(
        form.last_name.trim() && form.date_of_birth &&
        form.birth_place.trim() && form.gender &&
        (!isAdult(form.date_of_birth) || (/^\d{12}$/.test(form.cin_number) && form.cin_issued_at)) &&
        form.address.trim() && form.phone.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email),
    );
    const studentStepTwoValid = Boolean(
        form.school && form.filiere.trim() && form.student_card_number.trim() &&
        (!requireLevel || form.niveau_detail),
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
            const res = await submitUser(form);
            onCreated(res);
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
        <div className="w-full">
            <div className="w-full">
                <div className="mb-4">
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-[.2em] text-brass">
                        {eyebrow}
                    </p>
                    <h1 className="font-display text-2xl font-extrabold text-slate-900">
                        Ajouter un utilisateur
                    </h1>
                    <p className="mt-3 text-sm text-slate-600">
                        {subtitle}
                    </p>
                </div>
                <form
                    onSubmit={submit}
                    className="rounded-3xl border border-slate-200 bg-surface p-5 sm:p-5"
                >
                    {notice && (
                        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                            {notice}
                        </div>
                    )}
                    {error && (
                        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    <div className="mb-7">
                        <span className="mb-3 block text-sm font-bold text-slate-700">
                            Rôle
                        </span>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {roles.map((r) => (
                                <label
                                    key={r.value}
                                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 font-semibold ${form.role === r.value ? "border-brass bg-indigo-50 text-brass-deep" : "border-slate-200"}`}
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
                            requireLevel={requireLevel}
                        />
                    ) : (
                    <div className="grid gap-5 md:grid-cols-2">
                        {field("last_name", "Nom", "text", true)}
                        {field("first_name", "Prénom")}
                        {field("email", "Adresse e-mail", "email", true)}
                        {field("phone", "Numéro de téléphone", "tel", true)}
                        {field("address", "Adresse", "text", form.role !== "chercheur")}
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
                                Date de naissance *
                            </label>
                            <input
                                required
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
                                {field("department", "Département")}
                                {field("position", "Fonction / Grade")}
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
                                    "Institut / Faculté",
                                    "text",
                                    true,
                                )}
                                {field(
                                    "research_lab",
                                    "Laboratoire / Centre de recherche",
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
