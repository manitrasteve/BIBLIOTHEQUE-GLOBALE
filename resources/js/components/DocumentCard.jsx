import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, ScrollText, ClipboardList, FileText, Globe, Lock, ArrowUpRight, Languages, CalendarDays } from 'lucide-react';
import { stripHtml } from '../lib/utils';
import { languageLabel } from '../lib/languages';

export const TYPE_CONFIG = {
  livre: { label: 'Livre', icon: BookOpen },
  memoire: { label: 'Mémoire', icon: GraduationCap },
  these: { label: 'Thèse', icon: ScrollText },
  rapport: { label: 'Rapport', icon: ClipboardList },
  document: { label: 'Document', icon: FileText },
  autre: { label: 'Document', icon: FileText },
};

// Insensible à la casse et aux accents : « Mémoire », « MEMOIRE » et « memoire » doivent tous retrouver la même entrée.
export function normalizeType(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function callNumber(doc) {
  const prefix = (doc.category || 'GEN').slice(0, 3).toUpperCase();
  return `${prefix}.${doc.year || '----'}`;
}

// Carte « grille » du catalogue, compacte : couverture, type, titre, auteurs, niveau, langue et année.
function GridCard({ document, typeCfg, TypeIcon, AccessIcon, language }) {
  const isPublic = document.access_level === 'public';
  const authors = document.authors?.length ? document.authors.join(', ') : 'Auteur non renseigné';

  return (
    <Link
      to={`/documents/${document.slug}`}
      title={document.title}
      className="modern-card group flex h-full flex-col overflow-hidden"
    >
      <div className="relative flex h-32 items-center justify-center bg-slate-100">
        {document.cover_url ? (
          <img
            src={document.cover_url}
            alt=""
            loading="lazy"
            className="h-24 w-auto max-w-[60%] rounded object-cover transition-transform duration-300 group-hover:-translate-y-0.5"
          />
        ) : (
          <span className="flex h-24 w-[4.5rem] items-center justify-center rounded bg-indigo-600 text-on-primary-soft transition-transform duration-300 group-hover:-translate-y-0.5">
            <TypeIcon className="h-6 w-6" strokeWidth={1.5} />
          </span>
        )}

        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-brass-deep">
          <TypeIcon className="h-3 w-3" />
          {typeCfg.label}
        </span>
        <span
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-brass"
          title={isPublic ? 'Accès libre' : 'Connexion requise'}
          aria-label={isPublic ? 'Accès libre' : 'Connexion requise'}
        >
          <AccessIcon className="h-3 w-3" />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-brass-deep">
          {document.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-slate-500" title={authors}>
          {authors}
        </p>

        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          {document.niveau && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <GraduationCap className="h-3 w-3" />
              {document.niveau}
            </span>
          )}
          {language && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-brass-deep">
              <Languages className="h-3 w-3" />
              {language}
            </span>
          )}
          {document.year && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              <CalendarDays className="h-3 w-3" />
              {document.year}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// showCategory : affiche « Catégorie : … » sous le titre (utilisé par l'accueil uniquement).
// variant « grid » : carte verticale du catalogue ; par défaut, carte horizontale.
export default function DocumentCard({ document, showCategory = false, variant = 'row' }) {
  // Le type est saisi librement : un type inconnu s'affiche tel quel (les anciens codes gardent leur libellé).
  const typeCfg =
    TYPE_CONFIG[normalizeType(document.type)] ||
    { label: document.type || TYPE_CONFIG.autre.label, icon: TYPE_CONFIG.autre.icon };
  const TypeIcon = typeCfg.icon;
  const AccessIcon = document.access_level === 'public' ? Globe : Lock;
  const language = languageLabel(document.language);

  if (variant === 'grid') {
    return <GridCard document={document} typeCfg={typeCfg} TypeIcon={TypeIcon} AccessIcon={AccessIcon} language={language} />;
  }

  return (
    <Link
      to={`/documents/${document.slug}`}
      className="modern-card group block overflow-hidden p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="badge-modern bg-indigo-50 text-brass-deep">
              <TypeIcon className="h-3.5 w-3.5" />
              {typeCfg.label}
            </span>
            <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400">{callNumber(document)}</span>
          </div>
          <div className="mt-3 flex items-start gap-2">
            <h3 className="font-display text-xl font-extrabold leading-snug text-slate-900 group-hover:text-brass-deep">
              {document.title}
            </h3>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-brass" />
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
        {document.niveau && (
          <>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-brass" />
              Niveau {document.niveau}
            </span>
          </>
        )}
        {language && (
          <>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5 text-brass" />
              {language}
            </span>
          </>
        )}
        <span className="text-slate-300">•</span>
        <span className="inline-flex items-center gap-1.5">
          <AccessIcon className="h-3.5 w-3.5 text-brass" />
          {document.access_level === 'public' ? 'Accès libre' : 'Connexion requise'}
        </span>
      </div>
    </Link>
  );
}
