import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Send, Trash2, UserRound } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function StaffDiscussionPage() {
    const { user } = useAuth();
    const [params] = useSearchParams();
    const [librarians, setLibrarians] = useState([]);
    const [selectedId, setSelectedId] = useState(params.get("librarian") || "");
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [error, setError] = useState(null);
    const isAdmin = user?.role === "administrateur";

    async function loadConversation(id) {
        try {
            const response = isAdmin ? await api.getStaffConversation(id) : await api.getMyStaffConversation();
            setConversation(response.conversation);
            const result = await api.getStaffMessages(response.conversation.id);
            setMessages(result.messages || []);
        } catch (e) { setError(e?.data?.message || "Impossible de charger la discussion."); }
    }

    useEffect(() => {
        if (isAdmin) {
            api.getStaffLibrarians().then((r) => {
                const list = r.librarians || [];
                setLibrarians(list);
                const wanted = params.get("librarian");
                setSelectedId(wanted || String(list[0]?.id || ""));
            }).catch(() => setError("Impossible de charger les bibliothécaires."));
        } else loadConversation();
    }, []);

    useEffect(() => { if (isAdmin && selectedId) loadConversation(selectedId); }, [selectedId]);

    async function send(e) {
        e.preventDefault();
        if (!text.trim() || !conversation) return;
        const recipientId = isAdmin ? conversation.librarian_id : conversation.admin_id;
        try {
            const result = await api.sendStaffMessage({ recipient_id: recipientId, message: text.trim() });
            setMessages((list) => [...list, result.data]);
            setText("");
        } catch (e) { setError(e?.data?.message || "Envoi impossible."); }
    }

    async function remove(id) {
        if (!window.confirm("Supprimer ce message de votre historique ?")) return;
        try { await api.deleteStaffMessage(id); setMessages((list) => list.filter((m) => m.id !== id)); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }

    async function clearHistory() {
        if (!window.confirm("Supprimer tout votre historique de discussion ?")) return;
        try { await api.clearStaffHistory(); setMessages([]); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }

    const otherName = isAdmin ? conversation?.librarian?.name : conversation?.admin?.name;

    return (
        <div className="w-full">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><MessageCircle className="h-5 w-5 text-brass" /> Échange de discussion entre admin et bibliothécaire</h2><p className="mt-1 text-sm text-slate-500">Discussion privée, séparée des messages envoyés aux membres.</p></div>
                <div className="flex items-center gap-2">
                    <Link
                        to={isAdmin ? "/administrateur/messages" : "/bibliothecaire/messages"}
                        title="Retour aux messages"
                        aria-label="Retour aux messages"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    {conversation && <button onClick={clearHistory} className="flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Supprimer mon historique</button>}
                </div>
            </div>
            {isAdmin && <div className="mb-4 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-surface p-2">{librarians.map((l) => <button key={l.id} onClick={() => setSelectedId(String(l.id))} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${String(l.id) === String(selectedId) ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-indigo-50"}`}><UserRound className="mr-1 inline h-4 w-4" />{l.name}</button>)}</div>}
            {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {!conversation ? <div className="modern-card p-10 text-center text-slate-500">Sélectionnez une conversation.</div> : <div className="modern-card overflow-hidden">
                <div className="border-b border-slate-200 bg-indigo-50 p-4"><p className="font-bold text-brass-deep">Conversation avec {otherName}</p><p className="text-xs text-brass-deep">Messages privés entre le personnel.</p></div>
                <div className="min-h-72 max-h-[calc(100dvh-24rem)] space-y-3 overflow-y-auto bg-slate-50 p-4">
                    {messages.length === 0 && <p className="py-16 text-center text-sm text-slate-400">Aucun message. Commencez la discussion.</p>}
                    {messages.map((m) => { const mine = Number(m.sender_id) === Number(user.id); return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`group max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "bg-indigo-600 text-white" : "bg-surface text-slate-800 border border-slate-200"}`}><p className="whitespace-pre-wrap text-sm leading-6">{m.message}</p><div className={`mt-1 flex items-center justify-between gap-4 text-[10px] ${mine ? "text-white/85" : "text-slate-400"}`}><span>{new Date(m.created_at).toLocaleString("fr-FR")}</span><button onClick={() => remove(m.id)} title="Supprimer" className="opacity-70 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>; })}
                </div>
                <form onSubmit={send} className="flex gap-2 border-t border-slate-200 bg-surface p-3"><textarea value={text} onChange={(e) => setText(e.target.value)} rows="2" placeholder="Écrire un message…" className="min-w-0 flex-1 rounded-xl" /><button className="btn-primary self-end"><Send className="h-4 w-4" /> Envoyer</button></form>
            </div>}
        </div>
    );
}
