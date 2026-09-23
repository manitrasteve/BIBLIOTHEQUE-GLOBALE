import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { SearchX, Languages, LibraryBig, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { LANGUAGES } from '../lib/languages';
import SearchBar from '../components/SearchBar';
import DocumentCard from '../components/DocumentCard';
import Pager from '../components/Pager';
import { Skeleton } from '../components/Skeleton';

const chipClass = (active) =>
  `shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
    active
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
  }`;

function SkeletonGrid() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement des documents" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Skeleton className="block h-32 w-full rounded-none" />
          <div className="space-y-1.5 p-2.5">
            <Skeleton className="block h-4 w-5/6" />
            <Skeleton className="block h-3 w-1/2" />
            <Skeleton className="mt-2 block h-4 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  // Dans l'espace bibliothécaire, le layout fournit déjà les marges.
  const inLayout = useLocation().pathname.startsWith('/bibliothecaire');
  const q = searchParams.get('q') || '';
  const topRef = useRef(null);

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(searchParams.get('category_id') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  // La page est liée aux critères : une nouvelle recherche ou un nouveau filtre repart de la page 1.
  const criteria = `${q}|${categoryId}|${language}`;
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
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(language ? { language } : {}),
      })
      .then((res) => active && setResults(res))
      .catch(() => active && setError('Impossible de charger les résultats pour le moment.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [q, categoryId, language, page]);

  function changePage(next) {
    setPaging({ criteria, page: next });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const hasFilters = categoryId !== '' || language !== '';
  const total = results?.total ?? 0;

  return (
    <div ref={topRef} className={`w-full ${inLayout ? '' : 'px-4 py-5 sm:px-6 xl:px-8'}`}>
      <section className="modern-card mb-6 p-5 sm:p-6">
        <p className="section-label">
          <LibraryBig className="h-3.5 w-3.5" />
          Catalogue
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">
          {q ? (
            <>
              Résultats pour <span className="text-indigo-600">« {q} »</span>
            </>
          ) : (
            'Catalogue documentaire'
          )}
        </h1>
        <p className="mt-1 text-sm text-slate-500" role="status">
          {loading ? 'Recherche en cours…' : `${total} document${total > 1 ? 's' : ''} disponible${total > 1 ? 's' : ''}`}
        </p>

        <div className="mt-4 max-w-2xl">
          <SearchBar initialQuery={q} live />
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-start">
          {categories.length > 0 && (
            <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible" role="group" aria-label="Filtrer par catégorie">
              <button type="button" onClick={() => setCategoryId('')} className={chipClass(categoryId === '')} aria-pressed={categoryId === ''}>
                Toutes catégories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(String(c.id))}
                  className={chipClass(categoryId === String(c.id))}
                  aria-pressed={categoryId === String(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto">
            <label className="relative flex items-center">
              <Languages className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="sr-only">Langue</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-full border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-semibold text-slate-700"
              >
                <option value="">Toutes les langues</option>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setCategoryId('');
                  setLanguage('');
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-slate-500 hover:text-indigo-700"
              >
                <RotateCcw className="h-4 w-4" />
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </section>

      {loading && <SkeletonGrid />}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!loading && !error && results && (
        results.data.length === 0 ? (
          <div className="modern-card flex flex-col items-center p-10 text-center">
            <SearchX className="mb-3 h-8 w-8 text-slate-400" strokeWidth={1.5} />
            <p className="font-semibold text-slate-700">Aucun document ne correspond à cette recherche.</p>
            <p className="mt-1 text-sm text-slate-500">Essayez un autre mot-clé, une autre catégorie ou une autre langue.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
              {results.data.map((doc) => (
                <DocumentCard key={doc.slug} document={doc} variant="grid" />
              ))}
            </div>
            <Pager meta={results} onChange={changePage} />
          </>
        )
      )}
    </div>
  );
}
