import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchX, Languages, ChevronDown, LayoutGrid, List, X } from 'lucide-react';
import { api } from '../lib/api';
import { LANGUAGES, languageLabel } from '../lib/languages';
import SearchBar from '../components/SearchBar';
import CatalogueCard, { CATALOGUE_GRID_CLASS as GRID_CLASS } from '../components/CatalogueCard';
import Pager from '../components/Pager';
import { Skeleton } from '../components/Skeleton';
import { useFavoriteToggle } from '../lib/useFavoriteToggle';
import { useAuth } from '../context/AuthContext';

const tabClass = (active) =>
  `inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
    active
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : 'border-slate-200 bg-surface text-slate-600 hover:border-indigo-300 hover:text-brass-deep'
  }`;


const VIEW_KEY = 'catalogue_view';

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function SkeletonResults({ view }) {
  if (view === 'list') {
    return (
      <div role="status" aria-busy="true" aria-label="Chargement des documents" className="grid gap-2.5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="grid grid-cols-[3rem_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3 sm:grid-cols-[3.5rem_1fr]">
            <Skeleton className="block aspect-[3/4] w-full rounded-md" />
            <div className="space-y-2">
              <Skeleton className="block h-4 w-3/5" />
              <Skeleton className="block h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" aria-label="Chargement des documents" className={GRID_CLASS}>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index}>
          <Skeleton className="block aspect-[3/4] w-full rounded-l-md rounded-r-xl" />
          <Skeleton className="mt-3 block h-4 w-5/6" />
          <Skeleton className="mt-1.5 block h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Dans l'espace bibliothécaire, le layout fournit déjà les marges.
  const inLayout = location.pathname.startsWith('/bibliothecaire');
  const q = searchParams.get('q') || '';
  const by = searchParams.get('by') || '';
  const topRef = useRef(null);
  const [view, setView] = useState(readView);
  // Change quand l'étiquette de recherche est retirée : la barre de recherche repart vide.
  const [searchKey, setSearchKey] = useState(0);

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(searchParams.get('category_id') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  // La page est liée aux critères : une nouvelle recherche ou un nouveau filtre repart de la page 1.
  const criteria = `${q}|${by}|${categoryId}|${language}`;
  const [paging, setPaging] = useState({ criteria, page: 1 });
  const page = paging.criteria === criteria ? paging.page : 1;

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .searchDocuments({
        q,
        page,
        ...(q && by ? { by } : {}),
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(language ? { language } : {}),
      })
      .then((res) => active && setResults(res))
      .catch(() => active && setError('Impossible de charger les résultats pour le moment.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [q, by, categoryId, language, page]);

  function changePage(next) {
    setPaging({ criteria, page: next });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function changeView(next) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // stockage indisponible (navigation privée) : le choix vaut pour cette visite
    }
  }

  // Cœur des cartes : même action que le bouton Favori de la fiche document.
  function setFavorited(slug, favorited) {
    setResults((prev) =>
      prev && { ...prev, data: prev.data.map((d) => (d.slug === slug ? { ...d, is_favorited: favorited } : d)) },
    );
  }

  const toggleFavorite = useFavoriteToggle(setFavorited);
  // Les favoris demandent un compte : pas de cœur sur les cartes pour un visiteur non connecté.
  const { user } = useAuth();

  function clearQuery() {
    setSearchKey((k) => k + 1);
    navigate(location.pathname, { replace: true });
  }

  function clearAll() {
    setCategoryId('');
    setLanguage('');
    if (q) clearQuery();
  }

  const hasFilters = categoryId !== '' || language !== '';
  const total = results?.total ?? 0;
  const categoryName = categories.find((c) => String(c.id) === categoryId)?.name;
  const tags = [
    q && { key: 'q', label: `« ${q} »`, clear: clearQuery },
    categoryId && { key: 'category', label: categoryName || 'Catégorie', clear: () => setCategoryId('') },
    language && { key: 'language', label: languageLabel(language) || language, clear: () => setLanguage('') },
  ].filter(Boolean);

  return (
    <div ref={topRef} className={`w-full ${inLayout ? '' : 'px-4 py-6 sm:px-6 sm:py-8 xl:px-8'}`}>
      <header className="mb-2">
        <h1 className="font-display text-3xl font-extrabold leading-none tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-4xl">
          {q ? (
            <>
              Résultats pour <span className="text-brass">« {q} »</span>
            </>
          ) : (
            'Catalogue'
          )}
        </h1>

        <div className="mt-5 max-w-3xl">
          <SearchBar key={searchKey} initialQuery={q} initialBy={by || undefined} live variant="catalogue" />
        </div>

        {categories.length > 0 && (
          <div
            className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Filtrer par catégorie"
          >
            <button type="button" onClick={() => setCategoryId('')} className={tabClass(categoryId === '')} aria-pressed={categoryId === ''}>
              Toutes catégories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(String(c.id))}
                className={tabClass(categoryId === String(c.id))}
                aria-pressed={categoryId === String(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <section aria-label="Résultats" className="mt-4">
        <div
          className={`z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-surface py-2.5 pl-4 pr-2.5 sm:pl-5 ${
            inLayout ? '' : 'sticky top-[4.75rem]'
          }`}
        >
          <div className="min-w-[8rem] flex-1" aria-live="polite">
            <p className="text-sm font-semibold text-slate-900 sm:text-base">
              {loading ? '…' : `${total} document${total > 1 ? 's' : ''}`}
            </p>
            <p className="text-xs text-slate-500">
              {loading
                ? 'Chargement'
                : total
                  ? `Page ${results?.current_page ?? 1} sur ${results?.last_page ?? 1}`
                  : 'Aucun résultat'}
            </p>
          </div>

          <label className="relative order-last flex w-full items-center sm:order-none sm:w-auto">
            <Languages className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Langue</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-10 w-full appearance-none rounded-full border border-slate-200 bg-surface py-2 pl-10 pr-9 text-sm font-semibold text-slate-700 outline-none focus:border-brass"
            >
              <option value="">Toutes les langues</option>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          </label>

          <div className="flex rounded-full border border-slate-200 bg-surface p-0.5" role="group" aria-label="Affichage">
            {[
              { key: 'grid', label: 'Afficher en grille', Icon: LayoutGrid },
              { key: 'list', label: 'Afficher en liste', Icon: List },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => changeView(key)}
                aria-pressed={view === key}
                aria-label={label}
                title={label}
                className={`flex h-9 w-10 items-center justify-center rounded-full transition-colors ${
                  view === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-brass-deep'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-0.5 pt-4">
            {tags.map((t) => (
              <span key={t.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-surface py-1 pl-3.5 pr-1 text-sm font-medium text-brass-deep">
                <span className="max-w-[16rem] truncate">{t.label}</span>
                <button
                  type="button"
                  onClick={t.clear}
                  aria-label={`Retirer le filtre ${t.label}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-indigo-600 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {(tags.length > 1 || hasFilters) && (
              <button type="button" onClick={clearAll} className="px-1 text-sm font-semibold text-brass hover:text-brass-deep">
                Tout effacer
              </button>
            )}
          </div>
        )}

        <div className="pt-6">
          {loading && <SkeletonResults view={view} />}
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {!loading && !error && results && (
            results.data.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-16 text-center">
                <SearchX className="mb-4 h-10 w-10 text-slate-400" strokeWidth={1.5} />
                <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Aucun document trouvé</h2>
                <p className="mt-2 text-sm text-slate-500">Essayez un autre mot-clé, une autre catégorie ou une autre langue.</p>
                {tags.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-5 inline-flex h-11 items-center rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Effacer les filtres
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={view === 'list' ? 'grid gap-2.5' : GRID_CLASS}>
                  {results.data.map((doc) => (
                    <CatalogueCard key={doc.slug} document={doc} query={q} view={view} onToggleFavorite={user ? toggleFavorite : undefined} />
                  ))}
                </div>
                <Pager meta={results} onChange={changePage} />
              </>
            )
          )}
        </div>
      </section>
    </div>
  );
}
