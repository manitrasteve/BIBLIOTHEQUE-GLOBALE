import { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, MapPin, Clock, X } from 'lucide-react';
import { api } from '../../lib/api';
import { SkeletonList } from '../../components/Skeleton';

const emptyForm = {
  name: '',
  description: '',
  address: '',
  location: '',
  opening_hours: '',
  opening_days: '',
  map_link: '',
};

export default function AdminLibrariesPage() {
  const [libraries, setLibraries] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .getLibraries()
      .then(setLibraries)
      .catch(() => setError('Impossible de charger les bibliothèques.'));
  }

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(lib) {
    setForm({
      name: lib.name || '',
      description: lib.description || '',
      address: lib.address || '',
      location: lib.location || '',
      opening_hours: lib.opening_hours || '',
      opening_days: lib.opening_days || '',
      map_link: lib.map_link || '',
    });
    setEditingId(lib.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateLibrary(editingId, form);
      } else {
        await api.createLibrary(form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.data?.errors ? Object.values(err.data.errors)[0][0] : "L'enregistrement a échoué.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(lib) {
    if (!confirm(`Supprimer « ${lib.name} » ? Les documents et comptes associés doivent être migrés au préalable.`)) return;
    try {
      await api.deleteLibrary(lib.id);
      load();
    } catch {
      setError('Suppression impossible (des données y sont probablement encore rattachées).');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="flex items-center gap-2 font-display text-xl text-ink">
          <Building2 className="h-5 w-5 text-brass" strokeWidth={1.75} />
          Bibliothèques
        </h2>
        <button
          onClick={startCreate}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm text-paper hover:bg-brass-deep transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Ajouter une bibliothèque
        </button>
      </div>

      {error && <p className="text-red-700 mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-xl border border-line bg-paper p-6 max-w-xl">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg text-ink">{editingId ? 'Modifier' : 'Nouvelle bibliothèque'}</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-ink-soft hover:text-ink">
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Nom</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
            />
          </div>
          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Adresse</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Localisation</label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Horaires</label>
              <input
                placeholder="08h00 - 17h00"
                value={form.opening_hours}
                onChange={(e) => setForm({ ...form, opening_hours: e.target.value })}
                className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Jours d'ouverture</label>
              <input
                placeholder="Lundi - Vendredi"
                value={form.opening_days}
                onChange={(e) => setForm({ ...form, opening_days: e.target.value })}
                className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Lien de localisation (carte)</label>
            <input
              type="url"
              placeholder="https://maps.google.com/…"
              value={form.map_link}
              onChange={(e) => setForm({ ...form, map_link: e.target.value })}
              className="w-full rounded-lg border border-line bg-white/60 px-3 py-2.5"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-ink px-5 py-2 text-sm text-paper hover:bg-brass-deep transition-colors disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-ink-soft hover:text-ink">
              Annuler
            </button>
          </div>
        </form>
      )}

      {libraries === null ? (
        <SkeletonList count={4} />
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); setSubmittedQuery(query.trim()); }} className="mb-5 flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une bibliothèque…" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 text-sm" />
            <button className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper"><Building2 className="mr-2 inline h-4 w-4" />Rechercher</button>
          </form>
          <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
            <table className="min-w-full text-sm"><thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft"><th className="px-4 py-3">Nom</th><th className="px-4 py-3">Adresse</th><th className="px-4 py-3">Horaires</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody>{libraries.filter(lib => !submittedQuery || `${lib.name} ${lib.address || ''} ${lib.location || ''}`.toLowerCase().includes(submittedQuery.toLowerCase())).map(lib => <tr key={lib.id} className="border-b border-line last:border-0"><td className="px-4 py-3 font-medium text-ink">{lib.name}</td><td className="px-4 py-3 text-ink-soft">{lib.address || '—'}</td><td className="px-4 py-3 text-ink-soft">{lib.opening_days || '—'} · {lib.opening_hours || '—'}</td><td className="px-4 py-3"><div className="flex justify-end gap-3"><button onClick={() => startEdit(lib)} className="text-sm text-brass"><Pencil className="mr-1 inline h-3.5 w-3.5"/>Modifier</button><button onClick={() => remove(lib)} className="text-sm text-red-700"><Trash2 className="mr-1 inline h-3.5 w-3.5"/>Supprimer</button></div></td></tr>)}{libraries.filter(lib => !submittedQuery || `${lib.name} ${lib.address || ''} ${lib.location || ''}`.toLowerCase().includes(submittedQuery.toLowerCase())).length === 0 && <tr><td colSpan="4" className="p-8 text-center text-ink-soft">Aucune bibliothèque trouvée.</td></tr>}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}
