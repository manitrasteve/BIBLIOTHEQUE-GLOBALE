import { LibraryBig, Sparkles, ShieldCheck } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white/75">
      <div className="mx-auto w-full px-4 sm:px-6 xl:px-8 py-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <LibraryBig className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display font-extrabold text-slate-900">Bibliothèque Numérique</p>
                <p className="text-xs text-slate-500">Université de Mahajanga</p>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">
              Une plateforme moderne pour rechercher, consulter et valoriser les ressources documentaires universitaires.
            </p>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Plateforme</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500" /> Assistant documentaire IA</p>
              <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Consultation sécurisée</p>
            </div>
          </div>
          <div className="md:text-right">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Informations</p>
            <p className="mt-3 text-sm text-slate-500">© {new Date().getFullYear()} Université de Mahajanga</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
