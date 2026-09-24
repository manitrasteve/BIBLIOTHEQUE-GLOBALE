import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle(){
 const [dark,setDark]=useState(()=>localStorage.getItem("bm_theme")!=="light");
 useEffect(()=>{document.documentElement.classList.toggle("dark",dark);localStorage.setItem("bm_theme",dark?"dark":"light")},[dark]);
 return <button type="button" onClick={()=>setDark(v=>!v)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-surface text-slate-700 hover:bg-slate-100" aria-label={dark?"Activer le mode clair":"Activer le mode sombre"} title={dark?"Mode clair":"Mode sombre"}>{dark?<Sun className="h-5 w-5"/>:<Moon className="h-5 w-5"/>}</button>
}
