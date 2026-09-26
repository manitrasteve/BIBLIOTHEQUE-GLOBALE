import { useState } from "react";
import ReadingStatsCard from "../components/ReadingStatsCard";
import {
    Eye,
    EyeOff,
    Lock,
    User,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
    X,
} from "lucide-react";

import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
    const { user, setUser } = useAuth();

    const [showPasswordForm, setShowPasswordForm] = useState(false);

    const [oldPassword, setOldPassword] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");

    const [showPassword, setShowPassword] = useState(false);

    const [msg, setMsg] = useState(null);
    const [error, setError] = useState(null);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [profileForm, setProfileForm] = useState({ email: user?.email || '', phone: user?.phone || '', address: user?.address || '', school: user?.school || '', filiere: user?.filiere || '', niveau_type: user?.niveau_type || '', niveau_detail: user?.niveau_detail || '', faculty: user?.faculty || '', department: user?.department || '', position: user?.position || '', teaching_specialty: user?.teaching_specialty || '', research_lab: user?.research_lab || '', researcher_field: user?.researcher_field || '', specialty: user?.specialty || '', diploma: user?.diploma || '', workplace: user?.workplace || '', profession: user?.profession || '', experience: user?.experience || '' });

    function startEditing() {
        setProfileForm({ email: user?.email || '', phone: user?.phone || '', address: user?.address || '', school: user?.school || '', filiere: user?.filiere || '', niveau_type: user?.niveau_type || '', niveau_detail: user?.niveau_detail || '', faculty: user?.faculty || '', department: user?.department || '', position: user?.position || '', teaching_specialty: user?.teaching_specialty || '', research_lab: user?.research_lab || '', researcher_field: user?.researcher_field || '', specialty: user?.specialty || '', diploma: user?.diploma || '', workplace: user?.workplace || '', profession: user?.profession || '', experience: user?.experience || '' });
        setEditing(true);
    }

    async function saveProfile(e) {
        e.preventDefault(); setError(null); setMsg(null);
        try {
            const updated = await api.updateProfile(profileForm);
            setUser(updated); setEditing(false); setMsg('Profil mis à jour avec succès.');
        } catch (e) { setError(e?.data?.message || Object.values(e?.data?.errors || {})[0]?.[0] || 'Impossible de modifier le profil.'); }
    }

    async function uploadPhoto(file) {
        if (!file) return;
        setPhotoBusy(true); setError(null);
        try {
            const fd = new FormData(); fd.append("email", user.email); fd.append("phone", user.phone || ""); fd.append("address", user.address || ""); fd.append("photo", file);
            const updated = await api.updateProfile(fd); setUser(updated);
        } catch (e) { setError(e?.data?.message || "Impossible de modifier la photo."); } finally { setPhotoBusy(false); }
    }

    async function removePhoto() {
        setPhotoBusy(true);
        try { const updated = await api.deleteProfilePhoto(); setUser(updated); } catch(e) { setError(e?.data?.message || "Impossible de supprimer la photo."); } finally { setPhotoBusy(false); }
    }


    async function submit(e) {
        e.preventDefault();

        setError(null);
        setMsg(null);

        try {
            await api.changePassword({
                current_password: oldPassword,
                password: password,
                password_confirmation: confirm,
            });

            setMsg("Mot de passe modifié avec succès.");

            setOldPassword("");
            setPassword("");
            setConfirm("");

            // On ferme le formulaire après la modification
            setTimeout(() => {
                setShowPasswordForm(false);
                setMsg(null);
            }, 1800);
        } catch (e) {
            setError(
                e.data?.message ||
                    e.data?.errors?.current_password?.[0] ||
                    e.data?.errors?.password?.[0] ||
                    "Modification impossible.",
            );
        }
    }

    function cancelPasswordChange() {
        setShowPasswordForm(false);
        setOldPassword("");
        setPassword("");
        setConfirm("");
        setError(null);
        setMsg(null);
    }

    return (
        <div className="w-full">
            {/* Titre */}
            <div className="mb-6">
                <h2 className="font-display text-2xl font-extrabold text-slate-900">
                    Mon profil
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                    Consultez vos informations personnelles et gérez la sécurité
                    de votre compte.
                </p>
                <button type="button" onClick={editing ? () => setEditing(false) : startEditing} className="mt-4 btn-secondary">{editing ? 'Annuler la modification' : 'Modifier mes informations'}</button>
            </div>

            {editing && (
                <form onSubmit={saveProfile} className="modern-card mb-6 p-5 sm:p-7">
                    <h3 className="mb-4 text-lg font-extrabold text-slate-900">Modifier mes informations</h3>
                    <p className="mb-5 text-xs text-slate-500">Le nom, le genre, le rôle et le numéro de compte sont protégés. Seules les informations autorisées peuvent être modifiées.</p>
                    <div className="grid gap-4 md:grid-cols-2">
                        {Object.entries(profileForm).map(([key,value]) => {
                            const labels={email:'Adresse e-mail',phone:'Téléphone',address:'Adresse',school:'École',filiere:'Parcours',niveau_type:'Type de niveau',niveau_detail:'Niveau',faculty:'Faculté / Institut',department:'Département',position:'Fonction / Grade',teaching_specialty:"Spécialité / Domaine d'enseignement",research_lab:'Laboratoire / Centre de recherche',researcher_field:'Domaine de recherche',specialty:'Spécialité',diploma:'Diplôme',workplace:'Lieu de travail',profession:'Profession / Statut',experience:'Expérience'};
                            if (user?.role === 'etudiant' && ['faculty','department','position','teaching_specialty','research_lab','researcher_field','specialty','diploma','workplace','profession','experience'].includes(key)) return null;
                            if (user?.role === 'enseignant' && ['school','filiere','niveau_type','niveau_detail','research_lab','researcher_field'].includes(key)) return null;
                            if (user?.role === 'chercheur' && ['school','filiere','niveau_type','niveau_detail','department','position','teaching_specialty'].includes(key)) return null;
                            // Administrateur / Service Numérique : aucun champ métier (étudiant/enseignant/chercheur) ne s'applique à ces comptes.
                            if (['administrateur','bibliothecaire'].includes(user?.role) && !['email','phone','address'].includes(key)) return null;
                            return <label key={key} className="block"><span className="mb-1 block text-xs font-bold text-slate-500">{labels[key]||key}</span>{key==='experience'?<textarea rows="4" value={value||''} onChange={e=>setProfileForm(f=>({...f,[key]:e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/>:<input type={key==='email'?'email':'text'} value={value||''} onChange={e=>setProfileForm(f=>({...f,[key]:e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/>}</label>;
                        })}
                    </div>
                    <div className="mt-5 flex justify-end"><button type="submit" className="btn-primary">Enregistrer les modifications</button></div>
                </form>
            )}

            {/* Profil lecteur : réservé aux membres (le personnel ne « lit » pas au même sens). */}
            {["etudiant", "enseignant", "chercheur"].includes(user?.role) && <ReadingStatsCard />}

            {/* Carte principale */}
            <div className="modern-card overflow-hidden">
                {/* En-tête du profil */}
                <div className="border-b border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                            {user?.photo_url ? <img src={user.photo_url} alt="Photo de profil" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><User className="h-8 w-8" /></div>}
                            <label className="absolute -bottom-2 -right-2 cursor-pointer rounded-full bg-blue-600 p-2 text-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-brass)]" title="Modifier la photo">
                                {/* sr-only (et non hidden) : le champ reste atteignable au clavier et annoncé par les lecteurs d'écran. */}
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Modifier la photo de profil" disabled={photoBusy} onChange={e => uploadPhoto(e.target.files?.[0])} />
                                <span aria-hidden="true">✎</span>
                            </label>
                        </div>

                        <div>
                            <h3 className="text-xl font-extrabold text-slate-900">
                                {user?.name || "Utilisateur"}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                                {user?.email || "Adresse e-mail non disponible"}
                            </p>
                            {user?.photo_url && <button type="button" onClick={removePhoto} disabled={photoBusy} className="mt-2 text-xs font-semibold text-red-700">Supprimer la photo</button>}
                        </div>
                    </div>
                </div>

                {/* Informations personnelles */}
                <div className="p-4">
                    <div className="mb-5">
                        <h3 className="text-lg font-extrabold text-slate-900">
                            Informations personnelles
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                            Informations enregistrées lors de la création de
                            votre compte.
                        </p>
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-brass">Numéro de compte</p>
                            <p className="mt-1 font-bold text-brass-deep">{user?.numero_compte || user?.matricule ||"Non renseigné"}</p>
                        </div>
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-brass">Rôle</p>
                            <p className="mt-1 font-bold text-brass-deep capitalize">{({etudiant:"Étudiant", enseignant:"Enseignant", chercheur:"Chercheur", autres:"Autres", bibliothecaire:"Service Numérique", administrateur:"Administrateur"})[user?.role] || user?.role || "—"}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Nom / prénom */}
                        <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <div className="flex items-start gap-3">
                                <User className="mt-0.5 h-5 w-5 text-blue-700" />

                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Nom et prénom
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                        {user?.name || "Non renseigné"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Email */}
                        <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <div className="flex items-start gap-3">
                                <Mail className="mt-0.5 h-5 w-5 text-blue-700" />

                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Adresse e-mail
                                    </p>

                                    <p className="mt-1 break-all font-semibold text-slate-900">
                                        {user?.email || "Non renseigné"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Adresse */}
                        <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <div className="flex items-start gap-3">
                                <MapPin className="mt-0.5 h-5 w-5 text-blue-700" />

                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Adresse
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                        {user?.address || "Non renseignée"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Téléphone */}
                        <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <div className="flex items-start gap-3">
                                <Phone className="mt-0.5 h-5 w-5 text-blue-700" />

                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Téléphone
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                        {user?.phone || "Non renseigné"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {user?.school && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">École</p><p className="mt-1 font-semibold text-slate-900">{user.school}</p></div>}
                        {user?.filiere && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Parcours</p><p className="mt-1 font-semibold text-slate-900">{user.filiere}</p></div>}
                        {user?.niveau_type && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Niveau</p><p className="mt-1 font-semibold text-slate-900">{user.niveau_type}{user.niveau_detail ? ` — ${user.niveau_detail}` : ""}</p></div>}
                        {user?.specialty && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Spécialité</p><p className="mt-1 font-semibold text-slate-900">{user.specialty}</p></div>}
                        {user?.diploma && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Diplôme</p><p className="mt-1 font-semibold text-slate-900">{user.diploma}</p></div>}
                        {user?.workplace && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Entreprise de travail</p><p className="mt-1 font-semibold text-slate-900">{user.workplace}</p></div>}
                        {user?.researcher_field && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Chercheur en</p><p className="mt-1 font-semibold text-slate-900">{user.researcher_field}</p></div>}
                        {user?.profession && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Profession</p><p className="mt-1 font-semibold text-slate-900">{user.profession}</p></div>}
                        {user?.date_of_birth && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Date de naissance</p><p className="mt-1 font-semibold text-slate-900">{new Date(user.date_of_birth).toLocaleDateString("fr-FR")}</p></div>}
                        {user?.faculty && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Faculté / Institut</p><p className="mt-1 font-semibold text-slate-900">{user.faculty}</p></div>}
                        {user?.department && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Département</p><p className="mt-1 font-semibold text-slate-900">{user.department}</p></div>}
                        {user?.position && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Fonction / Grade</p><p className="mt-1 font-semibold text-slate-900">{user.position}</p></div>}
                        {user?.teaching_specialty && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Domaine d’enseignement</p><p className="mt-1 font-semibold text-slate-900">{user.teaching_specialty}</p></div>}
                        {user?.research_lab && <div className="rounded-2xl border border-slate-100 bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Laboratoire / Centre</p><p className="mt-1 font-semibold text-slate-900">{user.research_lab}</p></div>}
                        {/* Genre */}
                        <div className="rounded-2xl border border-slate-100 bg-surface p-4">
                            <div className="flex items-start gap-3">
                                <User className="mt-0.5 h-5 w-5 text-blue-700" />

                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Genre
                                    </p>

                                    <p className="mt-1 font-semibold capitalize text-slate-900">
                                        {user?.gender || "Non renseigné"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sécurité */}
                    <div className="mt-8 border-t border-slate-100 pt-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h3 className="text-lg font-extrabold text-slate-900">
                                    Sécurité du compte
                                </h3>

                                <p className="mt-1 text-sm text-slate-500">
                                    Modifiez votre mot de passe pour sécuriser
                                    votre compte.
                                </p>
                            </div>

                            {/* Bouton Changer */}
                            {!showPasswordForm && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPasswordForm(true);
                                        setError(null);
                                        setMsg(null);
                                    }}
                                    className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap"
                                >
                                    <Lock className="h-4 w-4" />
                                    Changer le mot de passe
                                </button>
                            )}
                        </div>

                        {/* Formulaire caché au départ */}
                        {showPasswordForm && (
                            <form
                                onSubmit={submit}
                                className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-5"
                            >
                                <div className="mb-5">
                                    <h4 className="font-extrabold text-blue-800">
                                        Changer le mot de passe
                                    </h4>

                                    <p className="mt-1 text-sm text-slate-500">
                                        Saisissez votre ancien mot de passe puis
                                        choisissez un nouveau mot de passe.
                                    </p>
                                </div>

                                {/* Ancien mot de passe */}
                                <label className="block text-sm font-bold text-slate-700">
                                    Ancien mot de passe
                                    <div className="relative mt-2">
                                        <input
                                            type={
                                                showPassword
                                                    ? "text"
                                                    : "password"
                                            }
                                            required
                                            value={oldPassword}
                                            onChange={(e) =>
                                                setOldPassword(e.target.value)
                                            }
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-11 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                            placeholder="Votre ancien mot de passe"
                                        />

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </label>

                                {/* Nouveau mot de passe */}
                                <label className="mt-4 block text-sm font-bold text-slate-700">
                                    Nouveau mot de passe
                                    <div className="relative mt-2">
                                        <input
                                            type={
                                                showPassword
                                                    ? "text"
                                                    : "password"
                                            }
                                            minLength="8"
                                            required
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-11 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                            placeholder="Minimum 8 caractères"
                                        />

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </label>

                                {/* Confirmation */}
                                <label className="mt-4 block text-sm font-bold text-slate-700">
                                    Confirmation du mot de passe
                                    <input
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        minLength="8"
                                        required
                                        value={confirm}
                                        onChange={(e) =>
                                            setConfirm(e.target.value)
                                        }
                                        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                        placeholder="Confirmez votre nouveau mot de passe"
                                    />
                                </label>

                                {/* Messages */}
                                {error && (
                                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                                        {error}
                                    </div>
                                )}

                                {msg && (
                                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                                        <ShieldCheck className="h-5 w-5" />
                                        {msg}
                                    </div>
                                )}

                                {/* Boutons */}
                                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                    <button
                                        type="submit"
                                        className="btn-primary inline-flex items-center justify-center gap-2"
                                    >
                                        <Lock className="h-4 w-4" />
                                        Changer
                                    </button>

                                    <button
                                        type="button"
                                        onClick={cancelPasswordChange}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-surface px-5 py-3 font-semibold text-slate-700 hover:bg-slate-300"
                                    >
                                        <X className="h-4 w-4" />
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
