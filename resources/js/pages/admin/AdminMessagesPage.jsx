import { useEffect, useState } from "react";
import { Mail, Send, Trash2, Users } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export default function AdminMessagesPage() {
    const { user } = useAuth();
    const isLibrarian = user?.role === "bibliothecaire";
    const [users, setUsers] = useState([]);
    const [history, setHistory] = useState([]);
    const [form, setForm] = useState({ subject: "", message: "", send_to_all: true, recipient_ids: [] });
    const [notice, setNotice] = useState(null);
    const [loading, setLoading] = useState(false);

    async function load() {
        try {
            const [recipients, messages] = await Promise.all([api.getMessageRecipients(), api.getAdminMessages()]);
            setUsers(recipients || []);
            setHistory(messages.data || []);
        } catch (e) {
            setNotice(e?.data?.message || "Impossible de charger la messagerie.");
        }
    }

    useEffect(() => { load(); }, []);

    async function send(e) {
        e.preventDefault();
        setLoading(true); setNotice(null);
        try {
            await api.sendAdminMessage(form);
            setNotice("Message envoyé avec succès.");
            setForm({ subject: "", message: "", send_to_all: true, recipient_ids: [] });
            await load();
        } catch (e) {
            setNotice(e?.data?.message || "Envoi impossible.");
        } finally { setLoading(false); }
    }

    async function remove(id) {
        if (!window.confirm("Supprimer ce message de votre historique ?")) return;
        try { await api.deleteAdminMessage(id); await load(); }
        catch (e) { setNotice(e?.data?.message || "Suppression impossible."); }
    }

    async function clear() {
        if (!window.confirm("Supprimer tout votre historique de messages envoyés ?")) return;
        try { await api.clearAdminMessageHistory(); setHistory([]); }
        catch (e) { setNotice(e?.data?.message || "Suppression impossible."); }
    }

    return (
        <div className="max-w-4xl space-y-7">
            <div>
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <Mail className="h-5 w-5 text-indigo-600" />
                    Messages aux utilisateurs
                </h2>
                <p className="mt-1 text-sm text-slate-500">{isLibrarian ? "Envoyez une information aux membres de la Bibliothèque." : "Envoyez une information aux membres et, lors d’un envoi général, informez également les bibliothécaires."}</p>
            </div>

            <form onSubmit={send} className="modern-card space-y-4 p-6">
                <input required placeholder="Objet" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full rounded-xl" />
                <textarea required rows="8" placeholder="Votre message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-xl" />
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={form.send_to_all} onChange={(e) => setForm({ ...form, send_to_all: e.target.checked })} />
                    <Users className="h-4 w-4 text-indigo-600" /> Envoyer à tous les comptes utilisateurs actifs
                </label>
                {!form.send_to_all && (
                    <select multiple value={form.recipient_ids} onChange={(e) => setForm({ ...form, recipient_ids: [...e.target.selectedOptions].map((o) => Number(o.value)) })} className="h-44 w-full rounded-xl">
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                    </select>
                )}
                {notice && <p className="rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">{notice}</p>}
                <button disabled={loading} className="btn-primary"><Send className="h-4 w-4" /> {loading ? "Envoi…" : "Envoyer"}</button>
            </form>

            <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-display font-bold">Historique des envois</h3>
                    {history.length > 0 && <button onClick={clear} className="flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /> Supprimer tous les historiques</button>}
                </div>
                <div className="space-y-2">
                    {history.map((item) => (
                        <div key={item.id} className="modern-card flex items-start justify-between gap-4 p-4">
                            <div className="min-w-0"><p className="font-bold">{item.subject}</p><p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{item.message}</p><p className="mt-2 text-xs text-slate-400">{item.recipient_count} destinataire(s) · {new Date(item.created_at).toLocaleString("fr-FR")}</p></div>
                            <button onClick={() => remove(item.id)} title="Supprimer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    ))}
                    {history.length === 0 && <div className="modern-card p-8 text-center text-sm text-slate-500">Aucun message envoyé.</div>}
                </div>
            </section>
        </div>
    );
}
