import { Mail, Phone, MapPin } from 'lucide-react';

// Pied de page bleu nuit (page d'accueil), sur le modèle du site de l'Université de Mahajanga :
// présentation et coordonnées, puis ligne de copyright.
// Fond bleu nuit (bg-footer, plus foncé en thème sombre) et texte blanc.

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-8 bg-footer text-[#ffffff]">
      <div className="umg-container grid gap-8 py-12 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start">
        {/* Présentation */}
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#ffffff] p-1">
              <img src="/images/logo-universite-mahajanga.png" alt="" className="h-full w-full object-contain" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-bold">Bibliothèque Globale</p>
              <p className="text-sm text-[#c9c9f0]">Université de Mahajanga</p>
            </div>
          </div>
          <p className="mt-5 max-w-md text-sm leading-6 text-[#c9c9f0]">
            Rechercher, consulter et valoriser les ressources documentaires de l'Université de Mahajanga :
            mémoires, thèses, ouvrages et rapports, avec lecture sécurisée et assistant documentaire IA.
          </p>
        </div>

        {/* Coordonnées */}
        <ul className="space-y-3 text-sm md:border-l md:border-[#2b2b8a] md:pl-10">
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1f1f86]">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="pt-1 text-[#e6e6fa]">Université de Mahajanga · Mahajanga 401, Madagascar</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1f1f86]">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <a href="tel:+261324208362" className="text-[#e6e6fa] hover:text-[#ffffff] hover:underline">+261 32 42 083 62</a>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1f1f86]">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <a href="mailto:bibliothequenumeriquemahajanga@gmail.com" className="break-all text-[#e6e6fa] hover:text-[#ffffff] hover:underline">
              bibliothequenumeriquemahajanga@gmail.com
            </a>
          </li>
        </ul>
      </div>

      <div className="border-t border-[#2b2b8a]">
        <div className="umg-container flex flex-col gap-2 py-5 text-sm text-[#c9c9f0] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Bibliothèque Globale · Université de Mahajanga · Tous droits réservés</p>
          <p className="italic">by Steve</p>
        </div>
      </div>
    </footer>
  );
}
