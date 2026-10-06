import { useEffect, useMemo, useState } from "react";
import { Trash2, RotateCcw, Trash, Search } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { SkeletonTable } from "../../components/Skeleton";
import { matchesSearch } from "../../lib/search";
import { sortRows } from "../../lib/sort";
import SortTh from "../../components/SortTh";
import ActionsTh from "../../components/ActionsTh";
import { useConfirm } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { usePageRefresh } from "../../context/RefreshContext";

function getVal(row, key) { return key === "library" ? row.library?.name : row[key]; }

export default function AdminTrashPage() {
    const confirm = useConfirm();
    const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState({ users: [], documents: [] });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usersSort, setUsersSort] = useState({ key: null, dir: "asc" });
  const [docsSort, setDocsSort] = useState({ key: null, dir: "asc" });
  const can = (permission) => user?.role === "administrateur" || user?.permissions?.includes(permission);

  const load = () => {
    setLoading(true); setError("");
    api.getTrash().then(setData).catch(e => setError(e?.data?.message || "Impossible de charger la corbeille.")).finally(() => setLoading(false));
  };
  useEffect(load, []);
  // Actualisation : le tableau reste affiché pendant le rechargement.
  usePageRefresh(() => api.getTrash().then((d) => { setData(d); setError(""); }));
  const users = useMemo(() => sortRows(data.users.filter(u => matchesSearch(`${u.name} ${u.email} ${u.matricule} ${u.role} ${u.library?.name}`, q)), usersSort, getVal), [data.users, q, usersSort]);
  const documents = useMemo(() => sortRows(data.documents.filter(d => matchesSearch(`${d.title} ${d.author} ${d.type} ${d.niveau} ${d.library?.name}`, q)), docsSort, getVal), [data.documents, q, docsSort]);
  async function action(fn, msg) { if (!(await confirm({ title: msg, danger: /supprim|définitiv|vider/i.test(msg) }))) return; try { await fn(); load(); } catch (e) { toast(e?.data?.message || e?.message || "Action impossible."); } }
  return <div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 font-display text-2xl font-extrabold"><Trash2 className="h-6 w-6 text-red-700"/>Corbeille</h2><p className="mt-1 text-sm text-slate-500">Éléments supprimés et récupérables.</p></div>{can("supprimer_definitivement_corbeille") && <button disabled={data.users.length + data.documents.length === 0} onClick={() => action(api.emptyTrash, "Vider définitivement toute la corbeille ? Cette action est irréversible.")} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Trash className="mr-2 inline h-4 w-4"/>Vider la corbeille</button>}</div>
    <form onSubmit={e => e.preventDefault()} className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un compte ou un document…" className="min-w-0 w-full sm:max-w-[600px] sm:flex-1 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm"/><button className="btn-primary w-full sm:w-auto sm:shrink-0"><Search className="h-4 w-4"/> Rechercher</button></form>
    {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface"><table className="min-w-full"><SkeletonTable columns={5} /></table></div> : <div className="space-y-8">
      <section><h3 className="mb-3 font-bold">Comptes ({users.length})</h3>
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-surface sm:block"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><SortTh label="Nom" sortKey="name" sort={usersSort} setSort={setUsersSort}/><SortTh label="E-mail" sortKey="email" sort={usersSort} setSort={setUsersSort}/><SortTh label="Rôle" sortKey="role" sort={usersSort} setSort={setUsersSort}/><SortTh label="Supprimé le" sortKey="deleted_at" sort={usersSort} setSort={setUsersSort}/>{(can("restaurer_corbeille") || can("supprimer_definitivement_corbeille")) && <ActionsTh />}</tr></thead><tbody>{users.length ? users.map(u => <tr key={u.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{u.name || "—"}</td><td className="px-4 py-3">{u.email || "—"}</td><td className="px-4 py-3">{u.role || "—"}</td><td className="px-4 py-3">{u.deleted_at ? new Date(u.deleted_at).toLocaleString("fr-FR") : "—"}</td>{(can("restaurer_corbeille") || can("supprimer_definitivement_corbeille")) && <td className="px-4 py-3"><div className="flex justify-end gap-2">{can("restaurer_corbeille") && <button onClick={() => action(() => api.restoreTrashUser(u.id), "Restaurer ce compte ?")} className="btn-secondary"><RotateCcw className="h-4 w-4"/>Restaurer</button>}{can("supprimer_definitivement_corbeille") && <button onClick={() => action(() => api.forceTrashUser(u.id), "Supprimer définitivement ce compte ?")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="h-4 w-4"/></button>}</div></td>}</tr>) : <tr><td colSpan="5" className="p-5 text-center text-slate-500">Aucun compte trouvé.</td></tr>}</tbody></table></div>
        <div className="space-y-3 sm:hidden">{users.length ? users.map(u => <div key={u.id} className="rounded-2xl border border-slate-200 bg-surface p-4"><p className="font-semibold text-slate-900">{u.name || "—"}</p><p className="mt-1 text-sm text-slate-600 break-words">{u.email || "—"}</p><p className="mt-1 text-xs text-slate-500">Rôle : {u.role || "—"}</p><p className="mt-1 text-xs text-slate-500">Supprimé le {u.deleted_at ? new Date(u.deleted_at).toLocaleString("fr-FR") : "—"}</p>{(can("restaurer_corbeille") || can("supprimer_definitivement_corbeille")) && <div className="mt-3 flex flex-col gap-2">{can("restaurer_corbeille") && <button onClick={() => action(() => api.restoreTrashUser(u.id), "Restaurer ce compte ?")} className="btn-secondary w-full justify-center"><RotateCcw className="h-4 w-4"/>Restaurer</button>}{can("supprimer_definitivement_corbeille") && <button onClick={() => action(() => api.forceTrashUser(u.id), "Supprimer définitivement ce compte ?")} className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="mr-1 inline h-4 w-4"/>Supprimer définitivement</button>}</div>}</div>) : <div className="rounded-2xl border border-slate-200 bg-surface p-5 text-center text-slate-500">Aucun compte trouvé.</div>}</div>
      </section>
      <section><h3 className="mb-3 font-bold">Documents ({documents.length})</h3>
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-surface sm:block"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><SortTh label="Titre" sortKey="title" sort={docsSort} setSort={setDocsSort}/><SortTh label="Type" sortKey="type" sort={docsSort} setSort={setDocsSort}/><SortTh label="Bibliothèque" sortKey="library" sort={docsSort} setSort={setDocsSort}/><SortTh label="Supprimé le" sortKey="deleted_at" sort={docsSort} setSort={setDocsSort}/><ActionsTh /></tr></thead><tbody>{documents.length ? documents.map(d => <tr key={d.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{d.title}</td><td className="px-4 py-3">{d.type || "—"}</td><td className="px-4 py-3">{d.library?.name || "—"}</td><td className="px-4 py-3">{d.deleted_at ? new Date(d.deleted_at).toLocaleString("fr-FR") : "—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => action(() => api.restoreTrashDocument(d.id), "Restaurer ce document ? Il reviendra en brouillon.")} className="btn-secondary"><RotateCcw className="h-4 w-4"/>Restaurer</button><button onClick={() => action(() => api.forceTrashDocument(d.id), "Supprimer définitivement ce document ?")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="h-4 w-4"/></button></div></td></tr>) : <tr><td colSpan="5" className="p-5 text-center text-slate-500">Aucun document trouvé.</td></tr>}</tbody></table></div>
        <div className="space-y-3 sm:hidden">{documents.length ? documents.map(d => <div key={d.id} className="rounded-2xl border border-slate-200 bg-surface p-4"><p className="font-semibold text-slate-900 break-words">{d.title}</p><p className="mt-1 text-xs text-slate-500">Type : {d.type || "—"}</p><p className="mt-1 text-xs text-slate-500">Bibliothèque : {d.library?.name || "—"}</p><p className="mt-1 text-xs text-slate-500">Supprimé le {d.deleted_at ? new Date(d.deleted_at).toLocaleString("fr-FR") : "—"}</p><div className="mt-3 flex flex-col gap-2"><button onClick={() => action(() => api.restoreTrashDocument(d.id), "Restaurer ce document ? Il reviendra en brouillon.")} className="btn-secondary w-full justify-center"><RotateCcw className="h-4 w-4"/>Restaurer</button><button onClick={() => action(() => api.forceTrashDocument(d.id), "Supprimer définitivement ce document ?")} className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="mr-1 inline h-4 w-4"/>Supprimer définitivement</button></div></div>) : <div className="rounded-2xl border border-slate-200 bg-surface p-5 text-center text-slate-500">Aucun document trouvé.</div>}</div>
      </section>
    </div>}
  </div>;
}
