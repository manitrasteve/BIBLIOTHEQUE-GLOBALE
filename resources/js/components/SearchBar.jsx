import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import { useDebouncedValue } from '../lib/search';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';

const FILTERS = [
  { key: 'title', label: 'Titre' },
  { key: 'author', label: 'Auteur' },
  { key: 'category', label: 'Catégorie' },
  { key: 'keyword', label: 'Mot-clé' },
];

// Grande barre du catalogue : même recherche, présentation en une seule pilule ; Ctrl K (⌘ K) y place le curseur.
function CatalogueSearchBar({ query, setQuery, filter, setFilter, handleSubmit }) {
  const inputRef = useRef(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-surface p-2 pl-4 focus-within:border-brass focus-within:ring-2 focus-within:ring-indigo-200 sm:flex-nowrap sm:gap-3 sm:pl-5"
    >
      <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Titre, auteur, catégorie ou mot-clé"
        aria-label="Rechercher dans le catalogue"
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 sm:py-2.5"
      />
      <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 lg:inline">
        {isMac ? '⌘ K' : 'Ctrl K'}
      </kbd>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <label className="relative flex-1 sm:flex-none">
          <span className="sr-only">Rechercher dans</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-11 w-full appearance-none rounded-full border border-slate-200 bg-slate-50 py-2 pl-4 pr-9 text-sm font-semibold text-slate-700 outline-none focus:border-brass sm:w-auto"
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          Rechercher
        </button>
      </div>
    </form>
  );
}

// variant « catalogue » : grande barre de la page catalogue ; par défaut, barre « tiroir » de l'accueil.
// initialBy : champ de recherche lu dans l'adresse (?by=), pour le garder affiché après rechargement.
export default function SearchBar({ initialQuery = '', initialBy = 'title', live = false, variant = 'default' }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialBy) ? initialBy : 'title');
  const navigate = useNavigate();
  const debouncedQuery = useDebouncedValue(query.trim(), 350);

  // Recherche dès la saisie ou au changement de champ (page de résultats) ; champ vide => état initial.
  useEffect(() => {
    if (!live || (debouncedQuery === initialQuery.trim() && filter === initialBy)) return;
    if (!debouncedQuery) {
      navigate('/recherche', { replace: true });
      return;
    }
    const params = new URLSearchParams({ q: debouncedQuery, by: filter });
    navigate(`/recherche?${params.toString()}`, { replace: true });
  }, [debouncedQuery, filter]);

  function handleSubmit(e) {
    e.preventDefault();
    const params = new URLSearchParams({ q: query, by: filter });
    navigate(`/recherche?${params.toString()}`);
  }

  if (variant === 'catalogue') {
    return <CatalogueSearchBar {...{ query, setQuery, filter, setFilter, handleSubmit }} />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-xl border border-line bg-paper p-2 sm:p-2.5"
    >
      {/* onglet façon tiroir de fichier */}
      <div className="absolute -top-3 left-6 rounded-t-md bg-brass px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-paper font-semibold">
        Recherche
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-36">
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </Select>

        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un livre, un mémoire, une thèse…"
          className="flex-1"
        />

        <Button type="submit" className="sm:px-3.5">
          <Search className="h-4 w-4" strokeWidth={1.5} />
          Rechercher
        </Button>
      </div>
    </form>
  );
}
