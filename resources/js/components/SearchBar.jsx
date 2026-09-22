import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
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

export default function SearchBar({ initialQuery = '', live = false }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState('title');
  const navigate = useNavigate();
  const debouncedQuery = useDebouncedValue(query.trim(), 350);

  // Recherche dès la saisie (page de résultats) ; champ vide => état initial.
  useEffect(() => {
    if (!live || debouncedQuery === initialQuery.trim()) return;
    if (!debouncedQuery) {
      navigate('/recherche', { replace: true });
      return;
    }
    const params = new URLSearchParams({ q: debouncedQuery, by: filter });
    navigate(`/recherche?${params.toString()}`, { replace: true });
  }, [debouncedQuery]);

  function handleSubmit(e) {
    e.preventDefault();
    const params = new URLSearchParams({ q: query, by: filter });
    navigate(`/recherche?${params.toString()}`);
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
