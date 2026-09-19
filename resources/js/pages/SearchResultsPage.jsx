import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { SearchX, Tag, Languages } from 'lucide-react';
import { api } from '../lib/api';
import SearchBar from '../components/SearchBar';
import DocumentCard from '../components/DocumentCard';
import { SkeletonDocumentCard } from '../components/Skeleton';

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  // Dans l'espace bibliothécaire, le layout fournit déjà les marges.
  const inLayout = useLocation().pathname.startsWith('/bibliothecaire');
  const q = searchParams.get('q') || '';

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(searchParams.get('category_id') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .searchDocuments({ q, ...(categoryId ? { category_id: categoryId } : {}), ...(language ? {language} : {}) })
      .then((res) => active && setResults(res))
      .catch(() => active && setError('Impossible de charger les résultats pour le moment.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [q, categoryId, language]);

  return (
    <div className={`w-full ${inLayout ? '' : 'px-4 sm:px-6 xl:px-8 py-5'}`}>
      <h1 className="font-display text-3xl text-ink mb-6">
        {q ? (
          <>
            Résultats pour <span className="text-brass">« {q} »</span>
          </>
        ) : (
          'Catalogue documentaire'
        )}
      </h1>

      <div className="max-w-2xl mb-4">
        <SearchBar initialQuery={q} live />
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Tag className="h-3.5 w-3.5 text-ink-soft/50 mr-1" strokeWidth={1.75} />
          <button
            onClick={() => setCategoryId('')}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              categoryId === '' ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-brass'
            }`}
          >
            Toutes catégories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(String(c.id))}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                categoryId === String(c.id) ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-brass'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-center gap-2"><Languages className="h-4 w-4 text-slate-400"/><select value={language} onChange={e=>setLanguage(e.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Toutes les langues</option><option value="fr">Français</option><option value="mg">Malgache</option><option value="en">Anglais</option><option value="es">Espagnol</option><option value="pt">Portugais</option><option value="it">Italien</option><option value="ru">Russe</option><option value="autre">Autre</option></select></div>

      {loading && <SkeletonDocumentCard />}
      {error && <p className="text-red-700">{error}</p>}

      {!loading && !error && results && (
        <>
          {results.data.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-10 text-center">
              <SearchX className="h-6 w-6 mx-auto text-ink-soft/50 mb-2" strokeWidth={1.5} />
              <p className="text-ink-soft">
                Aucun document ne correspond à cette recherche. Essayez un autre mot-clé
                ou une autre catégorie.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {results.data.map((doc) => (
                <DocumentCard key={doc.slug} document={doc} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
