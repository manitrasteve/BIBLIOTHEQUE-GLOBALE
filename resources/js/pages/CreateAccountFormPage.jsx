import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ChevronRight } from "lucide-react";
import { api } from "../lib/api";

const CENTERS = [
    "IOSTM",
    "IUGM",
    "ISSTM",
    "IUTAM",
    "ILCSS",
    "Faculté de Médecine",
    "Faculté des sciences, technologies et de l'environnement (FSTE)",
    "Ecoles et formations rattachées",
];

const LEVELS = ["L1", "L2", "L3", "M1", "M2", "Doctorat"];

const STEP_ONE_FIELDS = new Set([
    "last_name",
    "first_name",
    "date_of_birth",
    "birth_place",
    "cin_number",
    "cin_issued_at",
    "address",
    "phone",
    "email",
    "gender",
]);

const initialForm = {
    last_name: "",
    first_name: "",
    date_of_birth: "",
    birth_place: "",
    cin_number: "",
    cin_issued_at: "",
    address: "",
    phone: "",
    email: "",
    gender: "",
    school: "",
    filiere: "",
    student_card_number: "",
    niveau_detail: "",
};

function Field({ label, value, onChange, required = false, type = "text", placeholder, readOnly = false }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">
                {label}{required && <span className="text-red-700"> *</span>}
            </span>
            <input
                type={type}
                value={value}
                required={required}
                readOnly={readOnly}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-brass focus:ring-2 focus:ring-brass/20"
            />
        </label>
    );
}

export default function CreateAccountFormPage() {
    const { libraryId } = useParams();
    const navigate = useNavigate();
    const [library, setLibrary] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getLibrary(libraryId).then(setLibrary).catch(() => setError("Cette bibliothèque est introuvable."));
    }, [libraryId]);

    function update(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
        if (step === 2 && STEP_ONE_FIELDS.has(field)) setStep(1);
    }

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    const validCin = /^\d{12}$/.test(form.cin_number);
    const stepOneValid = Boolean(
        form.last_name.trim() &&
            form.date_of_birth &&
            form.birth_place.trim() &&
            form.gender &&
            validCin &&
            form.cin_issued_at &&
            form.address.trim() &&
            form.phone.trim() &&
            validEmail &&
            libraryId,
    );
    const stepTwoValid = Boolean(form.school && form.filiere.trim() && form.student_card_number.trim());

    async function submit(event) {
        event.preventDefault();
        if (!stepOneValid) {
            setStep(1);
            return;
        }
        if (!stepTwoValid) return;

        setLoading(true);
        setError(null);
        try {
            const response = await api.createAccountRequest({
                ...form,
                library_id: Number(libraryId),
                role: "etudiant",
                niveau_type: "Université",
            });
            navigate(`/ticket/${response.request.uuid}`);
        } catch (requestError) {
            setError(requestError?.data?.message || Object.values(requestError?.data?.errors || {})[0]?.[0] || "La demande n'a pas pu être envoyée.");
        } finally {
            setLoading(false);
        }
    }

    if (error && !library) return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-red-700">{error}</div>;
    if (!library) return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-ink-soft">Chargement…</div>;

    return (
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
            <Link to={`/creer-un-compte/${libraryId}`} className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-brass-deep">
                <ArrowLeft className="h-4 w-4" /> Retour à la présentation
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brass">Demande pour {library.name}</p>
            <h1 className="mt-2 font-display text-3xl text-ink">Créer un compte étudiant</h1>
            <p className="mt-3 text-sm text-ink-soft">Étape {step} sur 2</p>

            {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <form onSubmit={submit} className="mt-8 rounded-xl border border-line bg-paper p-5 sm:p-8">
                {step === 1 ? (
                    <div className="grid gap-5 md:grid-cols-2">
                        <div className="md:col-span-2"><Field label="Bibliothèque" value={library.name} onChange={() => {}} readOnly /></div>
                        <Field label="Nom" value={form.last_name} onChange={(value) => update("last_name", value)} required />
                        <Field label="Prénom" value={form.first_name} onChange={(value) => update("first_name", value)} />
                        <Field label="Né(e), le" type="date" value={form.date_of_birth} onChange={(value) => update("date_of_birth", value)} required />
                        <Field label="Lieu de naissance" value={form.birth_place} onChange={(value) => update("birth_place", value)} required />
                        <fieldset>
                            <legend className="mb-2 text-sm font-semibold text-ink">Genre <span className="text-red-700">*</span></legend>
                            <div className="flex gap-4 pt-2">
                                {[["masculin", "Masculin"], ["feminin", "Féminin"]].map(([value, label]) => (
                                    <label key={value} className="flex items-center gap-2 text-sm text-ink">
                                        <input type="radio" name="gender" value={value} checked={form.gender === value} onChange={() => update("gender", value)} />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <Field label="CIN n°" value={form.cin_number} onChange={(value) => update("cin_number", value.replace(/\D/g, "").slice(0, 12))} required placeholder="Taper le n° de CIN à 12 chiffres" />
                        <Field label="Délivré le" type="date" value={form.cin_issued_at} onChange={(value) => update("cin_issued_at", value)} required />
                        <Field label="Adresse" value={form.address} onChange={(value) => update("address", value)} required />
                        <Field label="Téléphone" type="tel" value={form.phone} onChange={(value) => update("phone", value)} required />
                        <div className="md:col-span-2"><Field label="Adresse E-mail" type="email" value={form.email} onChange={(value) => update("email", value)} required /></div>
                    </div>
                ) : (
                    <div className="space-y-7">
                        <fieldset>
                            <legend className="mb-3 text-sm font-semibold text-ink">Quel est votre centre ?</legend>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {CENTERS.map((center) => <label key={center} className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${form.school === center ? "border-brass bg-brass/10 text-ink" : "border-line"}`}><input type="radio" name="school" value={center} checked={form.school === center} onChange={() => update("school", center)} />{center}</label>)}
                            </div>
                        </fieldset>
                        <Field label="Filière" value={form.filiere} onChange={(value) => update("filiere", value)} required />
                        <Field label="N° de carte d'étudiant" value={form.student_card_number} onChange={(value) => update("student_card_number", value)} required />
                        <fieldset>
                            <legend className="mb-3 text-sm font-semibold text-ink">Niveau</legend>
                            <div className="flex flex-wrap gap-3">{LEVELS.map((level) => <label key={level} className="flex items-center gap-2 text-sm text-ink"><input type="radio" name="niveau_detail" value={level} checked={form.niveau_detail === level} onChange={() => update("niveau_detail", level)} />{level}</label>)}</div>
                        </fieldset>
                    </div>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button type="button" onClick={() => step === 1 ? navigate(`/creer-un-compte/${libraryId}`) : setStep(1)} className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Retour</button>
                    {step === 1 ? <button type="button" disabled={!stepOneValid} onClick={() => setStep(2)} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">Suivant <ChevronRight className="h-4 w-4" /></button> : <button type="submit" disabled={loading || !stepTwoValid} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{loading ? "Envoi…" : "Envoyer"}</button>}
                </div>
            </form>
        </div>
    );
}