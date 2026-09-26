import { Sparkles, ShieldCheck, Mail, Phone } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-surface">
      <div className="mx-auto w-full px-4 sm:px-6 xl:px-8 py-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-[#ffffff] p-1">
                <img src="/images/logo-universite-mahajanga.png" alt="Université de Mahajanga" className="h-full w-full object-contain" />
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
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Plateforme</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brass" /> Assistant documentaire IA</p>
              <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Consultation sécurisée</p>
            </div>
          </div>
          <div className="md:text-right">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Informations</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2 md:justify-end">
                <Mail className="h-4 w-4 shrink-0 text-brass" />
                <a href="mailto:bibliothequenumeriquemahajanga@gmail.com" className="break-all hover:underline">bibliothequenumeriquemahajanga@gmail.com</a>
              </p>
              <p className="flex items-center gap-2 md:justify-end">
                <Phone className="h-4 w-4 shrink-0 text-emerald-500" />
                <a href="tel:+261324208362" className="hover:underline">+261 32 42 083 62</a>
              </p>
            </div>
            <p className="mt-4 text-xs italic text-slate-500">by Steve</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
