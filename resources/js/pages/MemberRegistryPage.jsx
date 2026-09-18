import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { api } from "../lib/api";
import { SkeletonTable } from "../components/Skeleton";

export default function MemberRegistryPage() {
    const [data,setData]=useState({data:[],total:0}); const [q,setQ]=useState(""); const [loading,setLoading]=useState(true);
    const load=()=>{setLoading(true);api.getMembers(q?{q}:{}).then(r=>setData(r)).catch(()=>{}).finally(()=>setLoading(false));};
    useEffect(load,[]);
    return <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 font-display text-xl font-extrabold"><Users className="h-5 w-5 text-indigo-600"/> Listes des membres</h2><p className="mt-1 text-sm text-slate-500">Registre indépendant des comptes numériques.</p></div></div>
      <form onSubmit={e=>{e.preventDefault();load()}} className="mb-5 flex gap-2"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher nom, carte, matricule, e-mail…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"/><button className="btn-primary"><Search className="h-4 w-4"/> Rechercher</button></form>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Membre</th><th className="px-4 py-3 text-left">Bibliothèque</th><th className="px-4 py-3 text-left">Carte</th><th className="px-4 py-3 text-left">Matricule</th><th className="px-4 py-3 text-left">Compte</th></tr></thead>{loading?<SkeletonTable columns={5}/>:<tbody>{data.data?.length?data.data.map(m=><tr key={m.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{m.first_name} {m.last_name}</td><td className="px-4 py-3">{m.library?.name||"—"}</td><td className="px-4 py-3 font-semibold">{m.card_number||"—"}</td><td className="px-4 py-3">{m.matricule||"—"}</td><td className="px-4 py-3">{m.user_id?"Compte numérique":"Pas encore de compte"}</td></tr>):<tr><td colSpan="5" className="p-8 text-center text-slate-500">Aucun membre trouvé.</td></tr>}</tbody>}</table></div>
    </div>;
}
