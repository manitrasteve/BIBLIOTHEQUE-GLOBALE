import { useState } from "react";
import {
    User,
    Mail,
    Phone,
    Home as HomeIcon,
    Send,
    X,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { api } from "../../lib/api";

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
                    value={form[id] ?? ""}
                    onChange={update(id)}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-10 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                />
            </div>
        </div>
    );
}

export default function ServiceCreateAccountRequestPage({
    onCancel,
    onSuccess,
}) {
    const [form, setForm] = useState({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        gender: "masculin",
        address: "",
        role: "etudiant",
        date_of_birth: "",

        // Étudiant
        school: "",
        filiere: "",
        niveau_type: "Université",
        niveau_detail: "",

        // Commun / Enseignant
        faculty: "",
        department: "",
        position: "",
        teaching_specialty: "",

        // Chercheur
        research_lab: "",
        researcher_field: "",
        specialty: "",
        profession: "",
    });

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(false);

    const update = (key) => (e) => {
        setForm((current) => ({
            ...current,
            [key]: e.target.value,
        }));
    };

    async function submit(e) {
        e.preventDefault();

        setError("");
        setSuccess("");
        setSaving(true);

        try {
            const res = await api.createAccountRequestByLibrarian(form);

            setSuccess(
                res?.message ||
                    "La demande de création de compte a été envoyée à l'administrateur.",
            );

            if (typeof onSuccess === "function") {
                onSuccess(res);
            }

            // Réinitialisation du formulaire après succès
            setForm({
                first_name: "",
                last_name: "",
                email: "",
                phone: "",
                gender: "masculin",
                address: "",
                role: "etudiant",
                date_of_birth: "",

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
        } catch (err) {
            const errors = err?.data?.errors;

            setError(
                errors
                    ? Object.values(errors)[0]?.[0]
                    : err?.data?.message ||
                          err?.message ||
                          "Impossible d'envoyer la demande.",
            );
        } finally {
            setSaving(false);
        }
    }

    const field = (id, label, type = "text", required = false, placeholder) => (
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
            placeholder={placeholder}
        />
    );

    return (
        <div className="w-full">
            <div className="w-full">
                {/* En-tête */}
                <div className="mb-4">
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">
                        Service Numérique
                    </p>

                    <h1 className="font-display text-3xl font-extrabold text-slate-900">
                        Demande de création de compte
                    </h1>

                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                        Remplissez ce formulaire pour transmettre à
                        l'administrateur une demande de création de compte.
                        Après vérification, l'administrateur pourra valider ou
                        rejeter la demande.
                    </p>
                </div>

                {/* Formulaire */}
                <form
                    onSubmit={submit}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8"
                >
                    {/* Erreur */}
                    {error && (
                        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

                            <div>
                                <p className="font-semibold">
                                    Impossible d'envoyer la demande
                                </p>
                                <p className="mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Succès */}
                    {success && (
                        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

                            <div>
                                <p className="font-semibold">Demande envoyée</p>

                                <p className="mt-1">{success}</p>
                            </div>
                        </div>
                    )}

                    {/* Rôle */}
                    <div className="mb-7">
                        <span className="mb-3 block text-sm font-bold text-slate-700">
                            Type de compte
                        </span>

                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                {
                                    value: "etudiant",
                                    label: "Étudiant",
                                },
                                {
                                    value: "enseignant",
                                    label: "Enseignant",
                                },
                                {
                                    value: "chercheur",
                                    label: "Chercheur",
                                },
                            ].map((role) => (
                                <label
                                    key={role.value}
                                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 font-semibold transition ${
                                        form.role === role.value
                                            ? "border-violet-500 bg-violet-50 text-violet-700"
                                            : "border-slate-200 text-slate-700 hover:border-violet-200 hover:bg-slate-50"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="service-role"
                                        value={role.value}
                                        checked={form.role === role.value}
                                        onChange={() =>
                                            setForm((current) => ({
                                                ...current,
                                                role: role.value,
                                            }))
                                        }
                                    />

                                    {role.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Informations générales */}
                    <div className="mb-8">
                        <h2 className="mb-4 text-base font-extrabold text-slate-900">
                            Informations personnelles
                        </h2>

                        <div className="grid gap-5 md:grid-cols-2">
                            {field("last_name", "Nom", "text", true)}

                            {field("first_name", "Prénom", "text", true)}

                            {field("email", "Adresse e-mail", "email", true)}

                            {field("phone", "Numéro de téléphone", "tel", true)}

                            {field("address", "Adresse", "text", false)}

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-700">
                                    Genre
                                </label>

                                <select
                                    value={form.gender}
                                    onChange={update("gender")}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                                >
                                    <option value="masculin">Masculin</option>

                                    <option value="feminin">Féminin</option>
                                </select>
                            </div>

                            <div>
                                <label
                                    htmlFor="date_of_birth"
                                    className="mb-2 block text-sm font-semibold text-slate-700"
                                >
                                    Date de naissance
                                </label>

                                <input
                                    id="date_of_birth"
                                    type="date"
                                    value={form.date_of_birth}
                                    onChange={update("date_of_birth")}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Étudiant */}
                    {form.role === "etudiant" && (
                        <div className="mb-8 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                            <h2 className="mb-5 text-base font-extrabold text-slate-900">
                                Informations universitaires
                            </h2>

                            <div className="grid gap-5 md:grid-cols-2">
                                {field(
                                    "faculty",
                                    "Faculté / Institut",
                                    "text",
                                    true,
                                )}

                                {field("school", "Établissement", "text", true)}

                                {field(
                                    "filiere",
                                    "Mention / Filière",
                                    "text",
                                    true,
                                )}

                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                                        Niveau universitaire
                                    </label>

                                    <select
                                        value={form.niveau_detail}
                                        onChange={update("niveau_detail")}
                                        required
                                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                                    >
                                        <option value="">
                                            Sélectionner le niveau
                                        </option>

                                        <option value="L1">L1</option>
                                        <option value="L2">L2</option>
                                        <option value="L3">L3</option>
                                        <option value="M1">M1</option>
                                        <option value="M2">M2</option>
                                        
                                        <option value="Doctorat">
                                            Doctorat
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Enseignant */}
                    {form.role === "enseignant" && (
                        <div className="mb-8 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                            <h2 className="mb-5 text-base font-extrabold text-slate-900">
                                Informations professionnelles
                            </h2>

                            <div className="grid gap-5 md:grid-cols-2">
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
                            </div>
                        </div>
                    )}

                    {/* Chercheur */}
                    {form.role === "chercheur" && (
                        <div className="mb-8 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                            <h2 className="mb-5 text-base font-extrabold text-slate-900">
                                Informations de recherche
                            </h2>

                            <div className="grid gap-5 md:grid-cols-2">
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

                                {field(
                                    "profession",
                                    "Fonction / Statut",
                                    "text",
                                    false,
                                )}
                            </div>
                        </div>
                    )}

                    {/* Boutons */}
                    <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        {onCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={saving}
                                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <X className="h-4 w-4" />
                                Annuler
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Send className="h-4 w-4" />

                            {saving
                                ? "Envoi de la demande…"
                                : "Envoyer la demande"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
