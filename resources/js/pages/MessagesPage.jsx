import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, Trash2, UserRound, CheckCheck } from "lucide-react";
import { api } from "../lib/api";

export default function MessagesPage() {
    const [items, setItems] = useState(null);
    const [params] = useSearchParams();
    const [error, setError] = useState(null);

    async function load() {
        try { const response = await api.getMessages(); setItems(response.data || []); }
        catch (e) { setError(e?.data?.message || "Impossible de charger vos messages."); setItems([]); }
    }
    useEffect(() => { load(); }, []);

    useEffect(() => {
        const id = params.get("message");
        if (!id || !items) return;
        const item = items.find((x) => String(x.id) === String(id));
        if (item) {
            setTimeout(() => document.getElementById(`message-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            if (!item.read_at) open(item);
        }
    }, [items, params]);

    async function open(item) {
        if (item.read_at) return;
        setItems((current) => current.map((x) => x.id === item.id ? { ...x, read_at: new Date().toISOString() } : x));
        try { await api.markMessageRead(item.id); } catch { load(); }
    }
    async function remove(id) {
        if (!window.confirm("Supprimer ce message de votre compte ?")) return;
        try { await api.deleteMessage(id); setItems((current) => current.filter((x) => x.id !== id)); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }
    async function clear() {
        if (!window.confirm("Supprimer tous vos historiques/messages ?")) return;
        try { await api.clearMessages(); setItems([]); }
        catch (e) { setError(e?.data?.message || "Suppression impossible."); }
    }

    return (
        <div className="w-full">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div><h1 className="flex items-center gap-2 font-display text-2xl font-extrabold"><Mail className="h-6 w-6 text-brass" /> Messages</h1><p className="mt-1 text-sm text-slate-500">Les informations envoyées par la Bibliothèque apparaissent ici.</p></div>
                {items?.length > 0 && <button onClick={clear} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Supprimer tous les historiques</button>}
            </div>
            {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {items === null && <p className="text-sm text-slate-500">Chargement…</p>}
            {items?.length === 0 && <div className="modern-card p-10 text-center text-slate-500"><Mail className="mx-auto h-8 w-8 mb-3 text-slate-300" /><p>Aucun message pour le moment.</p></div>}
            <div className="space-y-3">
                {items?.map((item) => (
                    <article id={`message-${item.id}`} key={item.id} onClick={() => open(item)} className={`modern-card cursor-pointer p-5 ${item.read_at ? "" : "border-indigo-200 bg-indigo-50/30"}`}>
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-brass-deep"><UserRound className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{item.message?.subject}</h2>{!item.read_at && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">Nouveau</span>}</div><p className="mt-1 text-xs text-slate-500">{item.message?.sender?.name || "Bibliothèque"} · {new Date(item.created_at).toLocaleString("fr-FR")}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.message?.message}</p></div>
                            <button onClick={(e) => { e.stopPropagation(); remove(item.id); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        {item.read_at && <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400"><CheckCheck className="h-3.5 w-3.5" /> Lu</p>}
                    </article>
                ))}
            </div>
        </div>
    );
}
