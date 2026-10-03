import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, GraduationCap, ShieldCheck, UserRound, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { isAdult, isCompleteBirthDate } from "../lib/age";

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

const STEPS = [
    { number: 1, label: "Identité", icon: UserRound },
    { number: 2, label: "Scolarité", icon: GraduationCap },
];

function Field({ label, value, onChange, required = false, type = "text", placeholder, readOnly = false }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
                {label}{required && <span className="text-red-700"> *</span>}
            </span>
            <input
                type={type}
                value={value}
                required={required}
                readOnly={readOnly}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-indigo-100"
            />
        </label>
    );
}

// Choix unique présenté en tuile ou en pastille : le bouton radio reste présent (clavier, lecteurs d'écran).
function Choice({ name, value, checked, onChange, children, className = "" }) {
    return (
        <label
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                checked ? "border-brass bg-indigo-50 font-semibold text-ink" : "border-slate-200 text-ink-soft hover:border-brass"
            } ${className}`}
        >
            <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="accent-[#1a1a8c]" />
            {children}
        </label>
    );
}

function SectionTitle({ children }) {
    return <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft md:col-span-2">{children}</h2>;
}

export default function CreateAccountFormPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState(initialForm);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    function update(field, value) {
        setForm((current) => {
            const next = { ...current, [field]: value };
            // Moins de 18 ans : pas de CIN, les valeurs déjà saisies sont effacées.
            if (field === "date_of_birth" && !isAdult(value)) {
                next.cin_number = "";
                next.cin_issued_at = "";
            }
            return next;
        });
        if (step === 2 && STEP_ONE_FIELDS.has(field)) setStep(1);
    }

    // La CIN n'est demandée (et obligatoire) qu'à partir de 18 ans.
    const adult = isAdult(form.date_of_birth);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    const validCin = !adult || (/^\d{12}$/.test(form.cin_number) && Boolean(form.cin_issued_at));
    const stepOneValid = Boolean(
        form.last_name.trim() &&
            form.date_of_birth &&
            form.birth_place.trim() &&
            form.gender &&
            validCin &&
            form.address.trim() &&
            form.phone.trim() &&
            validEmail,
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

    return (
        <div className="relative">
            {/* Bandeau bleu nuit (couleur pleine) derrière le haut de la carte, comme la page de connexion. */}
            <div className="absolute inset-x-0 top-0 h-52 bg-umg-night sm:h-56" aria-hidden="true" />

            <div className="relative mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-6 sm:pt-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[#ffffff]">
                    <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-on-primary-soft hover:text-[#ffffff]">
                        <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
                    </Link>
                    <span className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ffffff] p-1">
                            <img src="/images/logo-universite-mahajanga.png" alt="" className="h-full w-full object-contain" />
                        </span>
                        <span className="leading-tight">
                            <span className="block font-display text-sm font-bold">Bibliothèque Globale</span>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary-soft">Université de Mahajanga</span>
                        </span>
                    </span>
                </div>

                <div className="overflow-hidden rounded-lg border border-line border-t-4 border-t-gold bg-surface">
                    {/* En-tête de carte : titre et étapes. */}
                    <div className="flex flex-col gap-5 border-b border-line px-5 py-5 sm:px-8 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="section-label">
                                <UserPlus className="h-3.5 w-3.5" /> Inscription étudiant
                            </p>
                            <h1 className="mt-2 font-display text-[26px] font-extrabold tracking-tight text-ink">Créer un compte étudiant</h1>
                            <p className="mt-1 text-sm text-ink-soft">La demande est examinée par le Service Numérique puis validée par l'administrateur.</p>
                        </div>
                        <ol className="flex items-center gap-2" aria-label={`Étape ${step} sur 2`}>
                            {STEPS.map(({ number, label, icon: Icon }, index) => {
                                const done = step > number;
                                const current = step === number;
                                return (
                                    <li key={number} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
                                        {index > 0 && <span className={`h-px w-6 sm:w-10 ${step > 1 ? "bg-brass" : "bg-line"}`} aria-hidden="true" />}
                                        <span
                                            className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                                                current
                                                    ? "border-indigo-800 bg-indigo-800 text-[#ffffff]"
                                                    : done
                                                      ? "border-brass bg-brass text-surface"
                                                      : "border-line text-ink-soft"
                                            }`}
                                        >
                                            {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                        </span>
                                        <span className={`text-sm ${current ? "font-bold text-ink" : "text-ink-soft"}`}>
                                            <span className="sr-only">Étape {number} : </span>
                                            {label}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {error && <p className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:mx-8">{error}</p>}

                    <form onSubmit={submit}>
                        <div className="px-5 py-6 sm:px-8">
                            {step === 1 ? (
                                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                                    <SectionTitle>État civil</SectionTitle>
                                    <Field label="Nom" value={form.last_name} onChange={(value) => update("last_name", value)} required />
                                    <Field label="Prénom" value={form.first_name} onChange={(value) => update("first_name", value)} />
                                    <Field label="Né(e), le" type="date" value={form.date_of_birth} onChange={(value) => update("date_of_birth", value)} required />
                                    <Field label="Lieu de naissance" value={form.birth_place} onChange={(value) => update("birth_place", value)} required />
                                    <fieldset>
                                        <legend className="mb-1.5 text-sm font-bold text-slate-700">Genre <span className="text-red-700">*</span></legend>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[["masculin", "Masculin"], ["feminin", "Féminin"]].map(([value, label]) => (
                                                <Choice key={value} name="gender" value={value} checked={form.gender === value} onChange={() => update("gender", value)}>
                                                    {label}
                                                </Choice>
                                            ))}
                                        </div>
                                    </fieldset>
                                    {adult ? (
                                        <>
                                            <Field label="CIN n°" value={form.cin_number} onChange={(value) => update("cin_number", value.replace(/\D/g, "").slice(0, 12))} required placeholder="Taper le n° de CIN à 12 chiffres" />
                                            <Field label="Délivré le" type="date" value={form.cin_issued_at} onChange={(value) => update("cin_issued_at", value)} required />
                                        </>
                                    ) : (
                                        isCompleteBirthDate(form.date_of_birth) && (
                                            <p className="self-end rounded-lg border border-line bg-paper-dim px-4 py-3 text-sm text-ink-soft md:col-span-2">
                                                Moins de 18 ans : la CIN n'est pas demandée.
                                            </p>
                                        )
                                    )}
                                    <div className="mt-2 md:col-span-2">
                                        <SectionTitle>Coordonnées</SectionTitle>
                                    </div>
                                    <Field label="Adresse E-mail" type="email" value={form.email} onChange={(value) => update("email", value)} required />
                                    <Field label="Téléphone" type="tel" value={form.phone} onChange={(value) => update("phone", value)} required />
                                    <div className="md:col-span-2"><Field label="Adresse" value={form.address} onChange={(value) => update("address", value)} required /></div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <fieldset>
                                        <legend className="mb-2 text-sm font-bold text-slate-700">Quel est votre établissement ?</legend>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {CENTERS.map((center) => (
                                                <Choice key={center} name="school" value={center} checked={form.school === center} onChange={() => update("school", center)}>
                                                    {center}
                                                </Choice>
                                            ))}
                                        </div>
                                    </fieldset>
                                    <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                                        <Field label="Parcours" value={form.filiere} onChange={(value) => update("filiere", value)} required />
                                        <Field label="N° de carte d'étudiant" value={form.student_card_number} onChange={(value) => update("student_card_number", value)} required />
                                    </div>
                                    <fieldset>
                                        <legend className="mb-2 text-sm font-bold text-slate-700">Niveau</legend>
                                        <div className="flex flex-wrap gap-2">
                                            {LEVELS.map((level) => (
                                                <Choice key={level} name="niveau_detail" value={level} checked={form.niveau_detail === level} onChange={() => update("niveau_detail", level)} className="min-w-[88px]">
                                                    {level}
                                                </Choice>
                                            ))}
                                        </div>
                                    </fieldset>
                                </div>
                            )}
                        </div>

                        {/* Pied de carte : navigation entre les étapes. */}
                        <div className="flex flex-col-reverse gap-3 border-t border-line bg-paper px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                            <button type="button" onClick={() => step === 1 ? navigate("/") : setStep(1)} className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Retour</button>
                            <p className="hidden text-sm text-ink-soft lg:block">
                                Déjà un compte ?{" "}
                                <Link to="/connexion" className="font-bold text-blue-700 hover:underline">Se connecter</Link>
                            </p>
                            {step === 1 ? <button type="button" disabled={!stepOneValid} onClick={() => setStep(2)} className="btn-primary !px-5 disabled:cursor-not-allowed disabled:opacity-50">Suivant <ChevronRight className="h-4 w-4" /></button> : <button type="submit" disabled={loading || !stepTwoValid} className="btn-primary !px-5 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{loading ? "Envoi…" : "Envoyer"}</button>}
                        </div>
                    </form>
                </div>

                <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-soft">
                    <ShieldCheck className="h-4 w-4 text-brass" aria-hidden="true" />
                    Inscription sécurisée · Service Numérique de l'Université
                </p>
            </div>
        </div>
    );
}
