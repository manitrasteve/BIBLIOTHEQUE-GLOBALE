import { useEffect, useMemo, useState } from "react";
import { Trash2, RotateCcw, AlertTriangle, Trash, Search } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { SkeletonTable } from "../../components/Skeleton";
import { matchesSearch } from "../../lib/search";

export default function AdminTrashPage() {
  const { user } = useAuth();
  const [data, setData] = useState({ users: [], documents: [] });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const can = (permission) => user?.role === "administrateur" || user?.permissions?.includes(permission);

  const load = () => {
    setLoading(true); setError("");
    api.getTrash().then(setData).catch(e => setError(e?.data?.message || "Impossible de charger la corbeille.")).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const users = useMemo(() => data.users.filter(u => matchesSearch(`${u.name} ${u.email} ${u.matricule} ${u.role} ${u.library?.name}`, q)), [data.users, q]);
  const documents = useMemo(() => data.documents.filter(d => matchesSearch(`${d.title} ${d.author} ${d.type} ${d.niveau} ${d.library?.name}`, q)), [data.documents, q]);
  async function action(fn, msg) { if (!confirm(msg)) return; try { await fn(); load(); } catch (e) { alert(e?.data?.message || e?.message || "Action impossible."); } }
  return <div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 font-display text-2xl font-extrabold"><Trash2 className="h-6 w-6 text-red-600"/>Corbeille</h2><p className="mt-1 text-sm text-slate-500">Éléments supprimés et récupérables.</p></div>{can("supprimer_definitivement_corbeille") && <button disabled={data.users.length + data.documents.length === 0} onClick={() => action(api.emptyTrash, "Vider définitivement toute la corbeille ? Cette action est irréversible.")} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Trash className="mr-2 inline h-4 w-4"/>Vider la corbeille</button>}</div>
    <form onSubmit={e => e.preventDefault()} className="mb-6 flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un compte ou un document…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"/><button className="btn-primary"><Search className="h-4 w-4"/> Rechercher</button></form>
    {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full"><SkeletonTable columns={5} /></table></div> : <div className="space-y-8">
      <section><h3 className="mb-3 font-bold">Comptes ({users.length})</h3><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Nom</th><th className="px-4 py-3 text-left">E-mail</th><th className="px-4 py-3 text-left">Rôle</th><th className="px-4 py-3 text-left">Supprimé le</th>{(can("restaurer_corbeille") || can("supprimer_definitivement_corbeille")) && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody>{users.length ? users.map(u => <tr key={u.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{u.name || "—"}</td><td className="px-4 py-3">{u.email || "—"}</td><td className="px-4 py-3">{u.role || "—"}</td><td className="px-4 py-3">{u.deleted_at ? new Date(u.deleted_at).toLocaleString("fr-FR") : "—"}</td>{(can("restaurer_corbeille") || can("supprimer_definitivement_corbeille")) && <td className="px-4 py-3"><div className="flex justify-end gap-2">{can("restaurer_corbeille") && <button onClick={() => action(() => api.restoreTrashUser(u.id), "Restaurer ce compte ?")} className="btn-secondary"><RotateCcw className="h-4 w-4"/>Restaurer</button>}{can("supprimer_definitivement_corbeille") && <button onClick={() => action(() => api.forceTrashUser(u.id), "Supprimer définitivement ce compte ?")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"><Trash2 className="h-4 w-4"/></button>}</div></td>}</tr>) : <tr><td colSpan="5" className="p-8 text-center text-slate-500">Aucun compte trouvé.</td></tr>}</tbody></table></div></section>
      <section><h3 className="mb-3 font-bold">Documents ({documents.length})</h3><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Titre</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Bibliothèque</th><th className="px-4 py-3 text-left">Supprimé le</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{documents.length ? documents.map(d => <tr key={d.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{d.title}</td><td className="px-4 py-3">{d.type || "—"}</td><td className="px-4 py-3">{d.library?.name || "—"}</td><td className="px-4 py-3">{d.deleted_at ? new Date(d.deleted_at).toLocaleString("fr-FR") : "—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => action(() => api.restoreTrashDocument(d.id), "Restaurer ce document ? Il reviendra en brouillon.")} className="btn-secondary"><RotateCcw className="h-4 w-4"/>Restaurer</button><button onClick={() => action(() => api.forceTrashDocument(d.id), "Supprimer définitivement ce document ?")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"><Trash2 className="h-4 w-4"/></button></div></td></tr>) : <tr><td colSpan="5" className="p-8 text-center text-slate-500">Aucun document trouvé.</td></tr>}</tbody></table></div></section>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle className="mr-2 inline h-4 w-4"/>La suppression définitive est irréversible.</div>
    </div>}
  </div>;
}
