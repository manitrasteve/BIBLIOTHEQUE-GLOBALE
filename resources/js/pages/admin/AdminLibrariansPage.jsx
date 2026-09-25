import { useEffect, useState } from "react";
import { Landmark, Plus, UserX, UserCheck, X, Search, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import DetailModal, { ViewButton } from "../../components/DetailModal";
import { userSections } from "../../lib/detailSections";
import CounterBar from "../../components/CounterBar";

const initial = { last_name: "", first_name: "", email: "", phone: "", address: "", gender: "", cin_number: "", cin_issued_at: "" };

function Form({ onClose, onCreated }) {
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await api.createLibrarian(form);
            onCreated(response);
        } catch (requestError) {
            setError(requestError?.data?.message || Object.values(requestError?.data?.errors || {})[0]?.[0] || "Création impossible.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
            <form onSubmit={submit} className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-surface p-5 text-slate-900 sm:p-5">
                <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-display text-xl font-extrabold">Ajouter un Service Numérique</h3>
                    <button type="button" onClick={onClose} aria-label="Fermer"><X /></button>
                </div>
                {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <div className="grid gap-5 md:grid-cols-2">
                    <label className="text-sm font-semibold">Nom *<input required value={form.last_name} onChange={update("last_name")} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                    <label className="text-sm font-semibold">Prénom<input value={form.first_name} onChange={update("first_name")} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                    <fieldset className="rounded-xl border border-slate-300 p-3">
                        <legend className="px-1 text-sm font-semibold">Genre *</legend>
                        <div className="flex gap-4 pt-2">
                            {[["masculin", "Masculin"], ["feminin", "Féminin"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="librarian-gender" value={value} checked={form.gender === value} onChange={update("gender")} required />{label}</label>)}
                        </div>
                    </fieldset>
                    <label className="text-sm font-semibold">N° CIN *<input required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} placeholder="Taper le n° de CIN à 12 chiffres" value={form.cin_number} onChange={(event) => setForm((current) => ({ ...current, cin_number: event.target.value.replace(/\D/g, "").slice(0, 12) }))} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                    <label className="text-sm font-semibold">Délivré le *<input required type="date" value={form.cin_issued_at} onChange={update("cin_issued_at")} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                    <label className="text-sm font-semibold">Adresse *<input required value={form.address} onChange={update("address")} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                    <label className="text-sm font-semibold">Numéro de téléphone *<input required type="tel" value={form.phone} onChange={update("phone")} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                    <label className="text-sm font-semibold md:col-span-2">Adresse e-mail *<input required type="email" value={form.email} onChange={update("email")} className="mt-2 w-full rounded-xl border border-slate-300 bg-surface p-3 text-slate-900" /></label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
                    <button disabled={busy} className="btn-primary"><Plus className="h-4 w-4" />{busy ? "Création…" : "Créer"}</button>
                </div>
            </form>
        </div>
    );
}

function ReasonModal({ title, onCancel, onConfirm }) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-md rounded-3xl bg-surface p-4 "><h3 className="font-display text-lg font-extrabold">{title}</h3><textarea autoFocus required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Expliquez la raison ici..." rows="4" className="mt-4 w-full rounded-xl" /><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="btn-secondary">Annuler</button><button disabled={!reason.trim() || busy} onClick={async () => { setBusy(true); await onConfirm(reason.trim()); setBusy(false); }} className="btn-primary">{busy ? "Envoi…" : "Envoyer"}</button></div></div></div>;
}

export default function AdminLibrariansPage() {
    const [rows, setRows] = useState([]);
    const [libraries, setLibraries] = useState([]);
    const [create, setCreate] = useState(false);
    const [modal, setModal] = useState(null);
    const [error, setError] = useState(null);
    const [viewing, setViewing] = useState(null);
    const [query, setQuery] = useState("");
    const [notice, setNotice] = useState(null); // résultat d'une création ou d'un renvoi de lien
    const [resending, setResending] = useState(null);

    // Recherche pendant la saisie sur le nom (partielle, sans casse ni accents) : filtre uniquement l'affichage.
    const visibleRows = rows.filter((user) => matchesSearch(user.name, query));

    const [loaded, setLoaded] = useState(false);
    // Compteurs calculés sur les lignes déjà chargées (liste non paginée) : ils suivent donc chaque action locale.
    const activeCount = rows.filter((user) => user.is_active).length;

    function load() {
        api.getLibrarians().then((list) => { setRows(list); setLoaded(true); }).catch((requestError) => setError(requestError?.data?.message || "Impossible de charger les bibliothécaires."));
    }

    useEffect(() => {
        load();
        api.getLibraries().then(setLibraries).catch(() => setError("Impossible de charger les bibliothèques."));
    }, []);

    async function deactivate(reason) {
        try { const user = await api.deactivateUser(modal.user.id, reason); setRows((current) => current.map((row) => row.id === user.id ? user : row)); setModal(null); }
        catch (requestError) { setError(requestError?.data?.message || "Désactivation impossible."); }
    }

    // Lien de création du mot de passe renvoyé à un bibliothécaire qui ne l'a pas encore créé.
    async function resendLink(user) {
        setResending(user.id);
        setError(null);
        setNotice(null);
        try {
            const response = await api.resendLibrarianSetupLink(user.id);
            setNotice({ text: response.message, warning: false });
        } catch (requestError) {
            setError(requestError?.data?.message || "Envoi impossible.");
        } finally {
            setResending(null);
        }
    }

    return <div><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><Landmark className="h-5 w-5 text-brass" /> Service Numérique</h2><p className="mt-1 text-sm text-slate-500">Gérez les membres du Service Numérique.</p></div><button onClick={() => setCreate(true)} className="btn-primary"><Plus className="h-4 w-4" /> Ajouter un Service Numérique</button></div><CounterBar total={loaded ? rows.length : null} items={[{ label: "Actifs", value: activeCount }, { label: "Désactivés", value: rows.length - activeCount }]} /><div className="relative mb-5 w-full sm:max-w-[600px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un bibliothécaire…" aria-label="Rechercher un bibliothécaire" className="w-full rounded-xl border border-slate-200 bg-surface py-3 pl-9 pr-4 text-sm" /></div>{notice && <p role={notice.warning ? "alert" : "status"} className={`mb-4 rounded-xl border p-3 text-sm font-medium ${notice.warning ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</p>}{error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="space-y-3">{visibleRows.map((user) => <div key={user.id} className="modern-card flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-bold">{user.name}</p><p className="text-xs text-slate-500">{user.email} · Numéro de compte {user.matricule ||"—"}</p></div><div className="flex flex-wrap items-center gap-2"><ViewButton onClick={() => setViewing(user)} />{!user.password_set_at ? <><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Mot de passe non créé</span><button onClick={() => resendLink(user)} disabled={resending !== null} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${resending === user.id ? "animate-spin" : ""}`} /> {resending === user.id ? "Envoi…" : "Renvoyer le lien"}</button></> : <><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.is_active ? "Actif" : "Désactivé"}</span>{user.is_active ? <button onClick={() => setModal({ type: "deactivate", user })} className="flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700"><UserX className="h-3.5 w-3.5" /> Désactiver</button> : <button onClick={() => api.reactivateUser(user.id).then(load)} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700"><UserCheck className="h-3.5 w-3.5" /> Réactiver</button>}</>}</div></div>)}{rows.length === 0 && <div className="modern-card p-10 text-center text-slate-500">Aucun bibliothécaire.</div>}{rows.length > 0 && visibleRows.length === 0 && <div className="modern-card p-10 text-center text-slate-500">Aucun bibliothécaire trouvé.</div>}</div>{create && <Form onClose={() => setCreate(false)} onCreated={(response) => { setRows((current) => [response.user, ...current]); setNotice(response.message ? { text: response.message, warning: response.mail_sent === false } : null); setCreate(false); }} />}{viewing && <DetailModal title={viewing.name} subtitle={viewing.email} sections={userSections(viewing, libraries.find((library) => library.id === viewing.library_id)?.name)} onClose={() => setViewing(null)} />}{modal?.type === "deactivate" && <ReasonModal title="Êtes-vous sûr de désactiver ce compte ?" onCancel={() => setModal(null)} onConfirm={deactivate} />}</div>;
}
