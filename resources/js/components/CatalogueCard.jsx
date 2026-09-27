import { Link } from 'react-router-dom';
import { GraduationCap, Heart, Languages, CalendarDays } from 'lucide-react';
import { TYPE_CONFIG, normalizeType } from './DocumentCard';
import { languageLabel } from '../lib/languages';

// Grille des cartes livre (catalogue, page d'accueil, Mes favoris).
export const CATALOGUE_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-7 sm:gap-x-5 sm:gap-y-8';

// Comparaison insensible à la casse et aux accents, caractère par caractère pour garder les positions du titre.
function fold(text) {
  return Array.from(String(text || ''), (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
}

// Met en évidence la première occurrence de la recherche dans le titre.
function Highlight({ text, query }) {
  const needle = fold(query.trim()).join('');
  const chars = fold(text);
  if (!needle || chars.some((c) => c.length !== 1)) return text;
  const at = chars.join('').indexOf(needle);
  if (at < 0) return text;
  const source = Array.from(text);
  return (
    <>
      {source.slice(0, at).join('')}
      <mark className="rounded-sm bg-indigo-200 px-0.5 text-inherit">{source.slice(at, at + needle.length).join('')}</mark>
      {source.slice(at + needle.length).join('')}
    </>
  );
}

export function docInfo(document) {
  const typeCfg =
    TYPE_CONFIG[normalizeType(document.type)] ||
    { label: document.type || TYPE_CONFIG.autre.label, icon: TYPE_CONFIG.autre.icon };
  return {
    typeCfg,

    authors: document.authors?.length ? document.authors.join(', ') : 'Auteur non renseigné',
    language: languageLabel(document.language),
  };
}

// Couverture façon livre : dos plus foncé à gauche, coins arrondis côté tranche.
export function Cover({ document, typeCfg, small = false }) {
  const TypeIcon = typeCfg.icon;
  return (
    <div
      className={`relative aspect-[3/4] overflow-hidden border-indigo-800 bg-indigo-600 text-white ${
        small ? 'rounded-l rounded-r-md border-l-4' : 'rounded-l-md rounded-r-xl border-l-[6px]'
      }`}
    >
      {document.cover_url ? (
        <img src={document.cover_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : small ? (
        <span className="flex h-full items-center justify-center">
          <TypeIcon className="h-5 w-5 text-on-primary-soft" strokeWidth={1.5} />
        </span>
      ) : (
        <div className="flex h-full flex-col justify-between p-3 sm:p-4">
          <span className="text-[11px] font-semibold text-on-primary-soft">
            {typeCfg.label}
            {document.year ? ` · ${document.year}` : ''}
          </span>
          <TypeIcon className="h-10 w-10 self-center text-on-primary-soft" strokeWidth={1.25} />
          <span className="line-clamp-2 text-[11px] font-medium text-on-primary-soft">
            {document.category || 'Catalogue'}
          </span>
        </div>
      )}
    </div>
  );
}

function Pills({ document, language, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {document.niveau && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <GraduationCap className="h-3 w-3" />
          {document.niveau}
        </span>
      )}
      {language && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-brass-deep">
          <Languages className="h-3 w-3" />
          {language}
        </span>
      )}
      {document.year && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <CalendarDays className="h-3 w-3" />
          {document.year}
        </span>
      )}
    </div>
  );
}

// Bouton cœur : ajoute ou retire le document des favoris (placé hors du lien pour ne pas ouvrir la fiche).
function FavoriteButton({ document, onToggleFavorite, className = '' }) {
  if (!onToggleFavorite) return null;
  const active = Boolean(document.is_favorited);
  const label = `${active ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${document.title}`;
  return (
    <button
      type="button"
      onClick={() => onToggleFavorite?.(document)}
      aria-pressed={active}
      aria-label={label}
      title={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={`z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${
        active ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 bg-surface text-slate-700 hover:text-rose-600'
      } ${className}`}
    >
      <Heart className={`h-4 w-4 ${active ? 'fill-current' : ''}`} strokeWidth={2} />
    </button>
  );
}

// Carte du catalogue (page Catalogue uniquement) : « grid » = couverture de livre, « list » = ligne compacte.
export default function CatalogueCard({ document, query = '', view = 'grid', onToggleFavorite }) {
  const { typeCfg, authors, language } = docInfo(document);

  if (view === 'list') {
    return (
      <div className="relative">
        <Link
          to={`/documents/${document.slug}`}
          className="group grid grid-cols-[3rem_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3 pr-14 transition-colors hover:border-indigo-300 sm:grid-cols-[3.5rem_1fr_auto] sm:gap-4 sm:pr-16"
        >
          <Cover document={document} typeCfg={typeCfg} small />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-brass-deep sm:text-base">
              <Highlight text={document.title} query={query} />
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
              {[authors, typeCfg.label, document.year, language].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="hidden max-w-[12rem] items-center gap-2 truncate text-sm font-medium text-slate-600 sm:flex">
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm bg-indigo-600" aria-hidden="true" />
            <span className="truncate">{document.library || 'Bibliothèque universitaire'}</span>
          </span>
        </Link>
        <FavoriteButton
          document={document}
          onToggleFavorite={onToggleFavorite}
          className="absolute right-3 top-1/2 -translate-y-1/2"
        />
      </div>
    );
  }

  return (
    <div className="group relative flex h-full flex-col">
      <Link to={`/documents/${document.slug}`} title={document.title} className="flex h-full flex-col rounded-xl">
        <div className="relative transition-transform duration-300 motion-safe:group-hover:-translate-y-1.5 motion-safe:group-hover:-rotate-1">
          <Cover document={document} typeCfg={typeCfg} />
          {document.cover_url && (
            <span className="absolute left-3 top-2 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-brass-deep">
              {typeCfg.label}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col pt-3">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-brass-deep">
            <Highlight text={document.title} query={query} />
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={authors}>
            {authors}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs font-medium text-slate-600">
            <i className="h-2 w-2 shrink-0 rounded-sm bg-indigo-600" aria-hidden="true" />
            <span className="truncate">{document.library || 'Bibliothèque universitaire'}</span>
          </p>
          <Pills document={document} language={language} className="mt-auto pt-2" />
        </div>
      </Link>
      <FavoriteButton
        document={document}
        onToggleFavorite={onToggleFavorite}
        className="absolute right-2 top-2 motion-safe:group-hover:-translate-y-1.5"
      />
    </div>
  );
}
