import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, FilePen, Plus, Pencil, UploadCloud, Archive, Trash2, Inbox, Sparkles, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebouncedValue } from '../../lib/search';
import { sortRows } from '../../lib/sort';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import SortTh from '../../components/SortTh';
import ActionsTh from '../../components/ActionsTh';
import { SkeletonTable } from '../../components/Skeleton';
import StatCard, { StatCardSkeleton } from '../../components/StatCard';

const STATUS_FILTERS = ['brouillon', 'publie', 'archive'];
const STATUS_LABELS = { brouillon: 'Brouillon', publie: 'Publié', archive: 'Archivé' };
// Icône et couleur de chaque carte de compteur ('' = Tous).
const STATUS_CARD_STYLES = {
  '': { icon: FileText },
  brouillon: { icon: FilePen, tone: 'warning' },
  publie: { icon: UploadCloud, tone: 'success' },
  archive: { icon: Archive },
};

function getDocVal(row, key) {
  if (key === 'category') return row.category?.name;
  if (key === 'library') return row.library?.name;
  return row[key];
}

export default function DocumentsManagePage() {
  const { user } = useAuth();
  const basePath = useLocation().pathname.startsWith('/administrateur') ? '/administrateur/documents' : '/bibliothecaire/documents';
  const can = (permission) => user?.role === 'administrateur' || user?.permissions?.includes(permission);
  const [documents, setDocuments] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);
  const [busySlug, setBusySlug] = useState(null);
  const [query, setQuery] = useState('');
  // Recherche pendant la saisie (titre, côté serveur : la liste est paginée) ; champ vidé => liste initiale.
  const searchTerm = useDebouncedValue(query.trim(), 250);
  const latestRequest = useRef(0);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null); // pagination du serveur
  const [counts, setCounts] = useState(null); // totaux réels (statuts + types), calculés par le serveur
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const sortedDocuments = documents ? sortRows(documents, sort, getDocVal) : documents;

  // Clic sur une carte : la liste n'affiche que ce statut (« Tous » ou la carte active : tous), puis on y descend.
  const listRef = useRef(null);
  function selectStatus(key) {
    setStatusFilter((current) => (key === '' || current === key ? '' : key));
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Changer de filtre ou de recherche repart de la première page.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    load();
  }, [statusFilter, searchTerm, page]);

  function load() {
    // Seule la réponse à la dernière requête est affichée (frappes rapides).
    const requestId = ++latestRequest.current;
    const params = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(searchTerm ? { q: searchTerm } : {}),
      ...(page > 1 ? { page } : {}),
    };

    api
      .getManagedDocuments(params)
      .then((res) => {
        if (requestId !== latestRequest.current) return;
        // Dernière ligne d'une page supprimée / archivée : on revient à la page précédente.
        if (res.data.length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setError(null);
        setDocuments(res.data);
        setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
        setCounts(res.counts || null);
      })
      .catch(() => {
        if (requestId === latestRequest.current) setError('Impossible de charger les documents.');
      });
  }

  async function publish(doc) {
    setBusySlug(doc.slug);
    try {
      await api.publishDocument(doc.id);
      load();
    } finally {
      setBusySlug(null);
    }
  }

  async function reindex(doc) { setBusySlug(doc.slug); try { await api.reindexDocument(doc.id); alert('Indexation RAG relancée.'); } finally { setBusySlug(null); } }

  async function archive(doc) {
    setBusySlug(doc.slug);
    try {
      await api.archiveDocument(doc.id);
      load();
    } finally {
      setBusySlug(null);
    }
  }

  async function remove(doc) {
    if (!confirm(`Supprimer « ${doc.title} » ? Cette action est irréversible.`)) return;
    setBusySlug(doc.slug);
    try {
      await api.deleteDocument(doc.id);
      load();
    } finally {
      setBusySlug(null);
    }
  }

  function renderDocActions(doc) {
    return (
      <>
        <Link
          to={`${basePath}/${doc.id}/modifier`}
          className="flex items-center gap-1 text-brass hover:text-brass-deep"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          Modifier
        </Link>
        {doc.status !== 'publie' && can('publier_document') && (
          <button
            onClick={() => publish(doc)}
            disabled={busySlug === doc.slug}
            className="flex items-center gap-1 text-green-700 hover:text-green-800 disabled:opacity-50"
          >
            <UploadCloud className="h-3.5 w-3.5" strokeWidth={1.75} />
            Publier
          </button>
        )}
        <button onClick={() => reindex(doc)} disabled={busySlug === doc.slug} className="flex items-center gap-1 text-brass hover:text-brass-deep disabled:opacity-50"><Sparkles className="h-3.5 w-3.5"/> Réindexer IA</button>
        {doc.status === 'publie' && (
          <button
            onClick={() => archive(doc)}
            disabled={busySlug === doc.slug}
            className="flex items-center gap-1 text-ink-soft hover:text-ink disabled:opacity-50"
          >
            <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
            Archiver
          </button>
        )}
        {user?.role === 'administrateur' && <button
          onClick={() => remove(doc)}
          disabled={busySlug === doc.slug}
          className="flex items-center gap-1 text-red-700 hover:text-red-800 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          Supprimer
        </button>}
      </>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Link
          to={`${basePath}/nouveau`}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm text-paper hover:bg-brass-deep transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Ajouter un document
        </Link>
      </div>

      {/* Cartes de compteurs : un clic filtre la liste (« Tous » ou la carte active : tous les documents). */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-live="polite">
        {counts
          ? ['', ...STATUS_FILTERS].map((key) => (
              <StatCard
                key={key || 'tous'}
                label={key ? STATUS_LABELS[key] : 'Tous'}
                value={(key ? counts[key] : counts.all) ?? 0}
                icon={STATUS_CARD_STYLES[key].icon}
                tone={STATUS_CARD_STYLES[key].tone}
                active={statusFilter === key}
                onClick={() => selectStatus(key)}
              />
            ))
          : Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
      </div>

      <div className="relative mb-6 w-full sm:max-w-[600px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un document…"
          aria-label="Rechercher un document"
          className="w-full rounded-xl border border-slate-200 bg-surface py-3 pl-9 pr-4 text-sm"
        />
      </div>

      {/* « Tous » : total général + répartition par type (valeurs calculées par le serveur) */}
      {statusFilter === '' && counts && counts.all > 0 && (
        <div className="mb-5 rounded-xl border border-line bg-paper p-4" aria-label="Répartition des documents">
          <p className="text-sm font-bold text-ink">Total général : {counts.all}</p>
          {counts.by_type?.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {counts.by_type.map((row) => (
                <li key={row.type} className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft">
                  {row.type} : <span className="font-semibold text-ink">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-red-700 mb-4">{error}</p>}

      <div ref={listRef} className="scroll-mt-24" />

      {documents === null ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface"><table className="min-w-full"><SkeletonTable columns={5} /></table></div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <Inbox className="h-6 w-6 mx-auto text-slate-400 mb-2" strokeWidth={1.5} />
          <p className="text-ink-soft text-sm">
            {searchTerm ? 'Aucun document trouvé.' : 'Aucun document dans cette catégorie.'}
          </p>
        </div>
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-xl border border-line bg-paper sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate-500 text-xs uppercase tracking-wide">
                <SortTh label="Titre" sortKey="title" sort={sort} setSort={setSort} />
                <SortTh label="Catégorie" sortKey="category" sort={sort} setSort={setSort} />
                <SortTh label="Année" sortKey="year" sort={sort} setSort={setSort} />
                <SortTh label="Bibliothèque" sortKey="library" sort={sort} setSort={setSort} />
                <SortTh label="Statut" sortKey="status" sort={sort} setSort={setSort} />
                <ActionsTh align="left" />
              </tr>
            </thead>
            <tbody>
              {sortedDocuments.map((doc) => (
                <tr key={doc.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink font-medium">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" strokeWidth={1.5} />
                      {doc.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{doc.category?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{doc.year}</td>
                  <td className="px-4 py-3 text-ink-soft">{doc.library?.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                        {renderDocActions(doc)}
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 sm:hidden">
          {sortedDocuments.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                  <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" strokeWidth={1.5} />
                  <span className="break-words">{doc.title}</span>
                </span>
                <StatusBadge status={doc.status} />
              </div>
              <p className="mt-1 text-xs text-ink-soft">{doc.category?.name} · {doc.year}</p>
              <p className="mt-1 text-xs text-ink-soft">{doc.library?.name}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {renderDocActions(doc)}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {meta?.last_page > 1 && (
        <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </button>
          <span className="text-sm text-ink-soft">
            Page {meta.current_page} / {meta.last_page} · {meta.total} document{meta.total > 1 ? 's' : ''}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
            Suivant
          </button>
        </nav>
      )}
    </div>
  );
}
