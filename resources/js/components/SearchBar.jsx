import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronDown, Search, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/search';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';

// « Tout » : recherche large (titre, résumé, mots-clés, auteurs), classée par pertinence.
const FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'title', label: 'Titre' },
  { key: 'author', label: 'Auteur' },
  { key: 'category', label: 'Catégorie' },
  { key: 'keyword', label: 'Mot-clé' },
];

// Suggestions pendant la frappe (titres et auteurs) : liste déroulante accessible au clavier
// (↑ ↓ pour parcourir, Entrée pour ouvrir, Échap pour fermer).
function useSuggestions(query) {
  const navigate = useNavigate();
  const listId = useId();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = useDebouncedValue(query.trim(), 200);

  useEffect(() => {
    if (term.length < 2) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    api.getSearchSuggestions(term)
      .then((res) => {
        if (cancelled) return;
        setItems([
          ...(res.documents || []).map((d) => ({ key: `d-${d.slug}`, type: 'document', label: d.title, hint: d.year, to: `/documents/${d.slug}` })),
          ...(res.authors || []).map((name) => ({ key: `a-${name}`, type: 'author', label: name, hint: 'Auteur', to: `/recherche?${new URLSearchParams({ q: name, by: 'author' })}` })),
        ]);
        setActive(-1);
      })
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [term]);

  const visible = open && items.length > 0;

  function choose(item) {
    setOpen(false);
    navigate(item.to);
  }

  function onKeyDown(e) {
    if (!visible) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // Parcours circulaire ; -1 = retour au champ de saisie.
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => {
        const next = i + step;
        if (next >= items.length) return -1;
        return next < -1 ? items.length - 1 : next;
      });
    } else if (e.key === 'Enter' && active >= 0 && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const inputProps = {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': visible,
    'aria-controls': listId,
    'aria-activedescendant': visible && active >= 0 ? `${listId}-${active}` : undefined,
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onKeyDown,
  };

  const list = visible ? (
    <ul
      id={listId}
      role="listbox"
      aria-label="Suggestions"
      className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-line bg-surface py-1.5 text-left shadow-lg"
    >
      {items.map((item, index) => {
        const Icon = item.type === 'author' ? UserRound : BookOpen;
        return (
          <li
            key={item.key}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // mousedown (et non click) : passe avant le blur du champ qui fermerait la liste.
            onMouseDown={(e) => {
              e.preventDefault();
              choose(item);
            }}
            onMouseEnter={() => setActive(index)}
            className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${index === active ? 'bg-slate-100' : ''}`}
          >
            <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{item.label}</span>
            {item.hint && <span className="shrink-0 text-xs text-slate-500">{item.hint}</span>}
          </li>
        );
      })}
    </ul>
  ) : null;

  return { inputProps, list, close: () => setOpen(false) };
}

// Grande barre du catalogue : même recherche, présentation en une seule pilule ; Ctrl K (⌘ K) y place le curseur.
function CatalogueSearchBar({ query, setQuery, filter, setFilter, handleSubmit, suggestions }) {
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
      onSubmit={(e) => {
        suggestions.close();
        handleSubmit(e);
      }}
      className="relative flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2 pl-4 focus-within:border-brass focus-within:ring-2 focus-within:ring-indigo-200 sm:flex-nowrap sm:gap-3 sm:pl-5"
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
        {...suggestions.inputProps}
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
            className="h-11 w-full appearance-none rounded-md border border-line bg-slate-50 py-2 pl-4 pr-9 text-sm font-semibold text-slate-700 outline-none focus:border-brass sm:w-auto"
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
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          Rechercher
        </button>
      </div>
      {suggestions.list}
    </form>
  );
}

// variant « catalogue » : grande barre de la page catalogue ; par défaut, barre « tiroir » de l'accueil.
// initialBy : champ de recherche lu dans l'adresse (?by=), pour le garder affiché après rechargement.
// Adresse de résultats : « Tout » n'ajoute pas de ?by= (recherche large côté serveur).
function resultsUrl(q, filter) {
  const params = new URLSearchParams({ q });
  if (filter !== 'all') params.set('by', filter);
  return `/recherche?${params.toString()}`;
}

export default function SearchBar({ initialQuery = '', initialBy = 'all', live = false, variant = 'default' }) {
  const initialFilter = FILTERS.some((f) => f.key === initialBy) ? initialBy : 'all';
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const navigate = useNavigate();
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const suggestions = useSuggestions(query);

  // Recherche dès la saisie ou au changement de champ (page de résultats) ; champ vide => état initial.
  useEffect(() => {
    if (!live || (debouncedQuery === initialQuery.trim() && filter === initialFilter)) return;
    if (!debouncedQuery) {
      navigate('/recherche', { replace: true });
      return;
    }
    navigate(resultsUrl(debouncedQuery, filter), { replace: true });
  }, [debouncedQuery, filter]);

  function handleSubmit(e) {
    e.preventDefault();
    navigate(resultsUrl(query, filter));
  }

  if (variant === 'catalogue') {
    return <CatalogueSearchBar {...{ query, setQuery, filter, setFilter, handleSubmit, suggestions }} />;
  }

  return (
    <form
      onSubmit={(e) => {
        suggestions.close();
        handleSubmit(e);
      }}
      className="relative rounded-md border border-line bg-paper p-2 sm:p-2.5"
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
          aria-label="Rechercher dans le catalogue"
          autoComplete="off"
          {...suggestions.inputProps}
          className="flex-1"
        />

        <Button type="submit" className="sm:px-3.5">
          <Search className="h-4 w-4" strokeWidth={1.5} />
          Rechercher
        </Button>
      </div>
      {suggestions.list}
    </form>
  );
}
