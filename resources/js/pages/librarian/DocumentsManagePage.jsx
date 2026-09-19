import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, Plus, Pencil, UploadCloud, Archive, Trash2, Inbox, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import { SkeletonTable } from '../../components/Skeleton';

const STATUS_FILTERS = ['brouillon', 'publie', 'archive'];
const STATUS_LABELS = { brouillon: 'Brouillon', publie: 'Publié', archive: 'Archivé' };

export default function DocumentsManagePage() {
  const { user } = useAuth();
  const basePath = useLocation().pathname.startsWith('/administrateur') ? '/administrateur/documents' : '/bibliothecaire/documents';
  const can = (permission) => user?.role === 'administrateur' || user?.permissions?.includes(permission);
  const [documents, setDocuments] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);
  const [busySlug, setBusySlug] = useState(null);

  useEffect(() => {
    load();
  }, [statusFilter]);

  function load() {
    api
      .getManagedDocuments(statusFilter ? { status: statusFilter } : {})
      .then((res) => setDocuments(res.data))
      .catch(() => setError('Impossible de charger les documents.'));
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              statusFilter === '' ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-brass'
            }`}
          >
            Tous
          </button>
          {STATUS_FILTERS.map((key) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                statusFilter === key ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-brass'
              }`}
            >
              {STATUS_LABELS[key]}
            </button>
          ))}
        </div>

        <Link
          to={`${basePath}/nouveau`}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm text-paper hover:bg-brass-deep transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Ajouter un document
        </Link>
      </div>

      {error && <p className="text-red-700 mb-4">{error}</p>}

      {documents === null ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full"><SkeletonTable columns={5} /></table></div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <Inbox className="h-6 w-6 mx-auto text-ink-soft/50 mb-2" strokeWidth={1.5} />
          <p className="text-ink-soft text-sm">Aucun document dans cette catégorie.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft/70 text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Titre</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Année</th>
                <th className="px-4 py-3">Bibliothèque</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink font-medium">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 flex-shrink-0 text-ink-soft/50" strokeWidth={1.5} />
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
                      <button onClick={() => reindex(doc)} disabled={busySlug === doc.slug} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5"/> Réindexer IA</button>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
