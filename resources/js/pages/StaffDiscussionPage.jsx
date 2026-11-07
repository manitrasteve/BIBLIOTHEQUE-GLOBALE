import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send, Trash2, UserRound } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { usePageRefresh } from "../context/RefreshContext";

export default function StaffDiscussionPage() {
    const confirm = useConfirm();
    const { user } = useAuth();
    const [params] = useSearchParams();
    const [librarians, setLibrarians] = useState([]);
    const [selectedId, setSelectedId] = useState(params.get("librarian") || "");
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    // Bibliothécaire : administrateur qui recevra la réponse (fil unique pouvant mêler plusieurs administrateurs).
    const [interlocutor, setInterlocutor] = useState(null);
    const [error, setError] = useState(null);
    const isAdmin = user?.role === "administrateur";

    const [sending, setSending] = useState(false);
    // Identifiant de la dernière demande : les réponses d'une conversation précédente sont ignorées.
    const latestRequest = useRef(0);

    async function loadConversation(id) {
        const requestId = ++latestRequest.current;
        // Changement de conversation : on vide l'affichage pour ne jamais écrire au mauvais destinataire.
        setConversation(null);
        setMessages([]);
        setInterlocutor(null);
        setText("");
        try {
            const response = isAdmin ? await api.getStaffConversation(id) : await api.getMyStaffConversation();
            if (requestId !== latestRequest.current) return;
            const result = await api.getStaffMessages(response.conversation.id);
            if (requestId !== latestRequest.current) return;
            setConversation(response.conversation);
            setMessages(result.messages || []);
            setInterlocutor(result.interlocutor || null);
            setError(null);
        } catch (e) { if (requestId === latestRequest.current) setError(e?.data?.message || "Impossible de charger la discussion."); }
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

    // Actualisation : nouveaux messages de la discussion ouverte (et liste des bibliothécaires côté administrateur).
    usePageRefresh(async () => {
        if (isAdmin) setLibrarians((await api.getStaffLibrarians()).librarians || []);
        if (conversation) {
            const requestId = latestRequest.current;
            const result = await api.getStaffMessages(conversation.id);
            if (requestId === latestRequest.current) {
                setMessages(result.messages || []);
                setInterlocutor(result.interlocutor || null);
            }
        }
        setError(null);
    });

    async function send(e) {
        e.preventDefault();
        if (!text.trim() || !conversation || sending) return;
        const recipientId = isAdmin ? conversation.librarian_id : conversation.admin_id;
        const requestId = latestRequest.current;
        const sent = text.trim();
        setSending(true);
        try {
            const result = await api.sendStaffMessage({ recipient_id: recipientId, message: sent });
            // Message parti : il ne reste jamais dans le champ, même si la conversation a changé entre-temps
            // (un nouveau brouillon commencé depuis, différent, est conservé).
            setText((current) => (current.trim() === sent ? "" : current));
            if (requestId !== latestRequest.current) return;
            setMessages((list) => [...list, result.data]);
        } catch (e) { if (requestId === latestRequest.current) setError(e?.data?.message || "Envoi impossible."); }
        finally { setSending(false); }
    }

    async function remove(id) {
        if (!(await confirm({ title: "Supprimer ce message de votre historique ?", danger: true }))) return;
        try { await api.deleteStaffMessage(id); setMessages((list) => list.filter((m) => m.id !== id)); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }

    async function clearHistory() {
        if (!(await confirm({ title: "Supprimer tout votre historique de discussion ?", danger: true }))) return;
        try { await api.clearStaffHistory(); setMessages([]); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }

    const otherName = isAdmin ? conversation?.librarian?.name : interlocutor?.name || conversation?.admin?.name;

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
                <div className="border-b border-slate-200 bg-indigo-50 p-4"><p className="font-bold text-brass-deep">Conversation avec {otherName}</p><p className="text-xs text-brass-deep">{!isAdmin && interlocutor?.name ? `Votre réponse sera envoyée à ${interlocutor.name}.` : "Messages privés entre le personnel."}</p></div>
                <div className="min-h-72 max-h-[calc(100dvh-24rem)] space-y-3 overflow-y-auto bg-slate-50 p-4">
                    {messages.length === 0 && <p className="py-16 text-center text-sm text-slate-500">Aucun message. Commencez la discussion.</p>}
                    {messages.map((m) => { const mine = Number(m.sender_id) === Number(user.id); return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`group max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "bg-indigo-600 text-white" : "bg-surface text-slate-800 border border-slate-200"}`}>{!isAdmin && (mine || m.sender?.name) && <p className={`mb-0.5 text-xs font-bold ${mine ? "text-on-primary-soft" : "text-brass-deep"}`}>{mine ? "Vous" : m.sender.name}</p>}<p className="whitespace-pre-wrap text-sm leading-6">{m.message}</p><div className={`mt-1 flex items-center justify-between gap-4 text-[10px] ${mine ? "text-on-primary-soft" : "text-slate-400"}`}><span>{new Date(m.created_at).toLocaleString("fr-FR")}</span><button onClick={() => remove(m.id)} title="Supprimer" className="opacity-70 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>; })}
                </div>
                <form onSubmit={send} className="flex gap-2 border-t border-slate-200 bg-surface p-3"><textarea value={text} onChange={(e) => setText(e.target.value)} rows="2" placeholder="Écrire un message…" className="min-w-0 flex-1 rounded-xl" /><button disabled={sending || !text.trim()} className="btn-primary self-end disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /> {sending ? "Envoi…" : "Envoyer"}</button></form>
            </div>}
        </div>
    );
}
