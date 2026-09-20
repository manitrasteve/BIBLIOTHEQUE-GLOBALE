import { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { matchesSearch } from '../../lib/search';
import { SkeletonList } from '../../components/Skeleton';
import { useAuth } from '../../context/AuthContext';
import DetailModal, { ViewButton } from '../../components/DetailModal';
import LibraryCover from '../../components/LibraryCover';
import { librarySections } from '../../lib/detailSections';

const emptyForm = {
  name: '',
  description: '',
  address: '',
  location: '',
  opening_hours: '',
  opening_days: '',
  map_link: '',
};

// Mêmes règles que les photos de profil et le backend : jpg/png/webp, 2 Mo max.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const inputClass = 'w-full rounded-lg border border-line bg-white/60 px-3 py-2.5';

export default function AdminLibrariesPage() {
  const { user } = useAuth();
  // Le bibliothécaire disposant de « Ajouter une bibliothèque » peut créer, pas modifier ni supprimer.
  const isAdmin = user?.role === 'administrateur';
  const [libraries, setLibraries] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function load() {
    api
      .getLibraries()
      .then(setLibraries)
      .catch(() => setError('Impossible de charger les bibliothèques.'));
  }

  function startCreate() {
    setForm(emptyForm);
    setPhoto(null);
    setEditing(null);
    setError(null);
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
    setPhoto(null);
    setEditing(lib);
    setError(null);
    setShowForm(true);
  }

  function pickPhoto(e) {
    const file = e.target.files?.[0] || null;
    if (file && !PHOTO_TYPES.includes(file.type)) {
      setError('La photo de couverture doit être au format JPG, PNG ou WebP.');
      e.target.value = '';
      return;
    }
    if (file && file.size > PHOTO_MAX_BYTES) {
      setError('La photo de couverture ne doit pas dépasser 2 Mo.');
      e.target.value = '';
      return;
    }
    setError(null);
    setPhoto(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!editing && !photo) {
      setError('La photo de couverture est obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value ?? ''));
      if (photo) body.append('photo', photo);
      if (editing) {
        await api.updateLibrary(editing.id, body);
      } else {
        await api.createLibrary(body);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.data?.errors ? Object.values(err.data.errors)[0][0] : err.data?.message || "L'enregistrement a échoué.");
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

  const filtered = (libraries || []).filter((lib) => matchesSearch(`${lib.name} ${lib.address || ''} ${lib.location || ''}`, query));

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
        <form onSubmit={handleSubmit} className="mb-6 w-full space-y-4 rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg text-ink">{editing ? 'Modifier' : 'Nouvelle bibliothèque'}</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-ink-soft hover:text-ink">
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Nom *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-ink-soft mb-1.5">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Adresse *</label>
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Localisation *</label>
              <input
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Horaires *</label>
              <input
                required
                placeholder="08h00 - 17h00"
                value={form.opening_hours}
                onChange={(e) => setForm({ ...form, opening_hours: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-ink-soft mb-1.5">Jours d'ouverture *</label>
              <input
                required
                placeholder="Lundi - Vendredi"
                value={form.opening_days}
                onChange={(e) => setForm({ ...form, opening_days: e.target.value })}
                className={inputClass}
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
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="library-cover" className="block text-sm text-ink-soft mb-1.5">
              {editing ? 'Remplacer la photo de couverture' : 'Ajouter une photo de couverture *'}
            </label>
            <input
              id="library-cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={!editing}
              onChange={pickPhoto}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-ink-soft">JPG, PNG ou WebP — 2 Mo maximum.</p>
            {(photoPreview || editing) && (
              <div className="mt-3 max-w-sm">
                <LibraryCover library={photoPreview ? { ...editing, id: 'preview', name: form.name, cover_url: photoPreview } : editing} />
                {editing && !photoPreview && !editing.cover_url && (
                  <p className="mt-1 text-xs text-ink-soft">Cette bibliothèque n'a pas encore de photo de couverture.</p>
                )}
              </div>
            )}
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
          <form onSubmit={(e) => e.preventDefault()} className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une bibliothèque…" className="min-w-0 w-full sm:max-w-[600px] sm:flex-1 rounded-xl border border-line bg-white px-4 py-3 text-sm" />
            <button className="w-full sm:w-auto sm:shrink-0 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper"><Building2 className="mr-2 inline h-4 w-4" />Rechercher</button>
          </form>
          <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Adresse</th>
                  <th className="px-4 py-3">Horaires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lib) => (
                  <tr key={lib.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{lib.name}</td>
                    <td className="px-4 py-3 text-ink-soft">{lib.address || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{lib.opening_days || '—'} · {lib.opening_hours || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <ViewButton onClick={() => setViewing(lib)} />
                        {isAdmin && <button onClick={() => startEdit(lib)} className="text-sm text-brass"><Pencil className="mr-1 inline h-3.5 w-3.5" />Modifier</button>}
                        {isAdmin && <button onClick={() => remove(lib)} className="text-sm text-red-700"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Supprimer</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-ink-soft">Aucune bibliothèque trouvée.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewing && (
        <DetailModal
          title={viewing.name}
          subtitle="Informations de la bibliothèque"
          media={<LibraryCover library={viewing} className="mb-6" />}
          sections={librarySections(viewing)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
