import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, ScrollText, ClipboardList, FileText, Globe, Lock, ArrowUpRight } from 'lucide-react';
import { stripHtml } from '../lib/utils';

const TYPE_CONFIG = {
  livre: { label: 'Livre', icon: BookOpen },
  memoire: { label: 'Mémoire', icon: GraduationCap },
  these: { label: 'Thèse', icon: ScrollText },
  rapport: { label: 'Rapport', icon: ClipboardList },
  document: { label: 'Document', icon: FileText },
  autre: { label: 'Document', icon: FileText },
};

// Insensible à la casse et aux accents : « Mémoire », « MEMOIRE » et « memoire » doivent tous retrouver la même entrée.
function normalizeType(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function callNumber(doc) {
  const prefix = (doc.category || 'GEN').slice(0, 3).toUpperCase();
  return `${prefix}.${doc.year || '----'}`;
}

// showCategory : affiche « Catégorie : … » sous le titre (utilisé par l'accueil uniquement).
export default function DocumentCard({ document, showCategory = false }) {
  // Le type est saisi librement : un type inconnu s'affiche tel quel (les anciens codes gardent leur libellé).
  const typeCfg =
    TYPE_CONFIG[normalizeType(document.type)] ||
    { label: document.type || TYPE_CONFIG.autre.label, icon: TYPE_CONFIG.autre.icon };
  const TypeIcon = typeCfg.icon;
  const AccessIcon = document.access_level === 'public' ? Globe : Lock;

  return (
    <Link
      to={`/documents/${document.slug}`}
      className="modern-card group block overflow-hidden p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="badge-modern bg-indigo-50 text-indigo-700">
              <TypeIcon className="h-3.5 w-3.5" />
              {typeCfg.label}
            </span>
            <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400">{callNumber(document)}</span>
          </div>
          <div className="mt-3 flex items-start gap-2">
            <h3 className="font-display text-xl font-extrabold leading-snug text-slate-900 group-hover:text-indigo-700">
              {document.title}
            </h3>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-600" />
          </div>
          {showCategory && document.category && (
            <p className="mt-1 text-sm font-medium text-slate-600">Catégorie : {document.category}</p>
          )}
          {document.subtitle && <p className="mt-1 text-sm italic text-slate-500">{document.subtitle}</p>}
          <p className="mt-3 text-sm font-medium text-slate-600">
            {document.authors?.length ? document.authors.join(', ') : 'Auteur non renseigné'}
            {document.year ? ` · ${document.year}` : ''}
          </p>
          {document.abstract && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{stripHtml(document.abstract)}</p>}
        </div>

        {document.cover_url ? (
          <img src={document.cover_url} alt="" className="hidden h-28 w-20 shrink-0 rounded-xl border border-slate-200 object-cover  sm:block" />
        ) : (
          <span className="hidden h-28 w-20 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-indigo-400 sm:flex">
            <BookOpen className="h-8 w-8" />
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
        <span>{document.library || 'Bibliothèque universitaire'}</span>
        {document.language && <><span className="text-slate-300">•</span><span>🌐 {({fr:'Français',mg:'Malgache',en:'Anglais',es:'Espagnol',pt:'Portugais',it:'Italien',ru:'Russe',autre:'Autre'})[document.language] || document.language}</span></>}
        <span className="text-slate-300">•</span>
        <span className="inline-flex items-center gap-1.5">
          <AccessIcon className="h-3.5 w-3.5 text-indigo-500" />
          {document.access_level === 'public' ? 'Accès libre' : 'Connexion requise'}
        </span>
      </div>
    </Link>
  );
}
