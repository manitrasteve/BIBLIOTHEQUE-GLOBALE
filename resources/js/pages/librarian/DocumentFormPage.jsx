import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { UploadCloud, Image as ImageIcon, FileSpreadsheet, X } from "lucide-react";
import { api } from "../../lib/api";
import RichTextEditor from "../../components/RichTextEditor";

// Langue reste un champ libre. Les anciens documents contiennent des codes
// (« memoire », « fr ») : on affiche leur libellé à la modification.
const LEGACY_TYPE_LABELS = { livre: "Livre", memoire: "Mémoire", these: "Thèse", rapport: "Rapport", autre: "Autre" };
const LEGACY_LANGUAGE_LABELS = { fr: "Français", mg: "Malgache", en: "Anglais", es: "Espagnol", pt: "Portugais", it: "Italien", ru: "Russe", autre: "Autre" };

// Listes également utilisées par l'importation Excel (DocumentImportService.php) : à garder synchronisées.
const TYPE_OPTIONS = ["Mémoire", "Livre", "Thèse", "Rapport", "Document", "Autre"];
const NIVEAU_OPTIONS = ["L1", "L2", "L3", "M1", "M2", "Doctorat"];
const CATEGORY_OPTIONS = ["Agronomie", "Droit", "Finance", "Informatique", "Lettres et sciences humaines", "Médecine", "Autre"];

const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

const ACCESS_LEVELS = [
    { value: "public", label: "Public (aucune connexion requise)" },
    { value: "authentifie", label: "Authentifié (tout utilisateur connecté)" },
    { value: "restreint", label: "Restreint (uniquement sa bibliothèque)" },
];

const emptyForm = {
    title: "",
    subtitle: "",
    abstract: "",
    type: "",
    niveau: "",
    category: "",
    library_id: "",
    year: "",
    publisher: "",
    isbn: "",
    language: "",
    edition: "",
    keywords: "",
    access_level: "authentifie",
    author_ids: [],
};

/**
 * Formulaire « Ajouter / Modifier un document ».
 *
 * Importation Excel : la page d'import réutilise ce même formulaire en lui passant
 * `importItem` (valeurs initiales d'une ligne Excel + PDF / couverture associés par nom
 * + auteurs à créer) ; `onImported` est alors appelé après la création au lieu de
 * revenir à la liste. Sans ces props, le comportement est celui de l'ajout manuel.
 */
export default function DocumentFormPage({ importItem = null, onImported = null }) {
    const { id } = useParams();
    const isEditing = Boolean(id);
    const navigate = useNavigate();
    const listPath = useLocation().pathname.startsWith("/administrateur")
        ? "/administrateur/documents"
        : "/bibliothecaire/documents";

    const [form, setForm] = useState(() => ({
        ...emptyForm,
        ...(importItem?.form || {}),
        library_id: importItem?.form?.library_id ? String(importItem.form.library_id) : "",
    }));
    const [libraries, setLibraries] = useState([]);
    const [authors, setAuthors] = useState([]);
    const [file, setFile] = useState(importItem?.file || null);
    const [cover, setCover] = useState(importItem?.cover || null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [newAuthor, setNewAuthor] = useState("");
    const [authorError, setAuthorError] = useState(null);
    // Auteurs de la ligne Excel inconnus de la base : créés à l'enregistrement du document.
    const [pendingAuthors, setPendingAuthors] = useState(importItem?.newAuthors || []);
    const [typeOther, setTypeOther] = useState(() => {
        const type = importItem?.form?.type || "";
        return type !== "" && !TYPE_OPTIONS.includes(type);
    });
    const [categoryOther, setCategoryOther] = useState(() => {
        const category = importItem?.form?.category || "";
        return category !== "" && !CATEGORY_OPTIONS.includes(category);
    });

    useEffect(() => {
        api.getLibraries()
            .then(setLibraries)
            .catch(() => {});
        api.getAuthors({ per_page: 500 })
            .then((res) => setAuthors(res.data))
            .catch(() => {});

        if (isEditing) {
            api.getManagedDocument(id).then((doc) => {
                const type = LEGACY_TYPE_LABELS[doc.type] || doc.type || "";
                const category = doc.category?.name || "";

                setForm({
                    title: doc.title || "",
                    subtitle: doc.subtitle || "",
                    abstract: doc.abstract || "",
                    type,
                    niveau: doc.niveau || "",
                    category,
                    library_id: doc.library_id,
                    year: doc.year || "",
                    publisher: doc.publisher || "",
                    isbn: doc.isbn || "",
                    language: LEGACY_LANGUAGE_LABELS[doc.language] || doc.language || "",
                    edition: doc.edition || "",
                    keywords: doc.keywords || "",
                    access_level: doc.access_level,
                    author_ids: doc.authors?.map((a) => a.id) || [],
                });
                // Document déjà existant avec un type/catégorie hors des options
                // prédéfinies (ancienne saisie libre) : on garde sa valeur exacte
                // via le champ "Autre" plutôt que de la perdre silencieusement.
                setTypeOther(type !== "" && !TYPE_OPTIONS.includes(type));
                setCategoryOther(category !== "" && !CATEGORY_OPTIONS.includes(category));
            }).catch((e) => setError(e.data?.message || "Impossible de charger ce document."));
        }
    }, [id]);

    function toggleAuthor(authorId) {
        setForm((prev) => ({
            ...prev,
            author_ids: prev.author_ids.includes(authorId)
                ? prev.author_ids.filter((a) => a !== authorId)
                : [...prev.author_ids, authorId],
        }));
    }

    async function addAuthor() {
        const name = newAuthor.trim();

        if (!name) {
            setAuthorError("Saisissez le nom de l'auteur.");
            return;
        }

        setAuthorError(null);

        try {
            const author = await api.createAuthor({ name });

            setAuthors((prev) =>
                [...prev, author].sort((a, b) =>
                    String(a.name).localeCompare(String(b.name), "fr"),
                ),
            );

            setForm((prev) => ({
                ...prev,
                author_ids: [...prev.author_ids, author.id],
            }));

            setNewAuthor("");
        } catch (err) {
            const errors = err?.data?.errors;

            setAuthorError(
                errors
                    ? Object.values(errors)?.[0]?.[0]
                    : err?.data?.message || "Impossible d'ajouter cet auteur.",
            );
        }
    }

    // Crée les auteurs en attente (importation) avec l'endpoint habituel et renvoie leurs identifiants.
    // Un auteur créé est aussitôt coché : en cas d'échec du document, un nouvel essai ne le recrée pas.
    async function createPendingAuthors() {
        const ids = [];
        for (const name of pendingAuthors) {
            let author;
            try {
                author = await api.createAuthor({ name });
            } catch (err) {
                // Nom déjà pris entre-temps : on reprend l'auteur existant.
                const list = (await api.getAuthors({ per_page: 500 })).data;
                author = list.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());
                if (!author) throw err;
            }
            ids.push(author.id);
            setAuthors((prev) => (prev.some((a) => a.id === author.id) ? prev : [...prev, author]));
            setPendingAuthors((prev) => prev.filter((n) => n !== name));
            setForm((prev) => ({ ...prev, author_ids: [...new Set([...prev.author_ids, author.id])] }));
        }
        return ids;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            if (isEditing) {
                const payload = new FormData();
                Object.entries(form).forEach(([key, value]) => {
                    if (key === "author_ids")
                        value.forEach((v) => payload.append("author_ids[]", v));
                    else payload.append(key, value ?? ""); // les champs vidés sont envoyés (ex. effacer le niveau)
                });
                if (file) payload.append("file", file);
                if (cover) payload.append("cover", cover);
                await api.updateDocument(id, payload);
                navigate(listPath);
            } else {
                if (!file) {
                    setError("Le fichier PDF est obligatoire.");
                    setSubmitting(false);
                    return;
                }
                const authorIds = [...new Set([...form.author_ids, ...(await createPendingAuthors())])];
                const payload = new FormData();
                Object.entries({ ...form, author_ids: authorIds }).forEach(([key, value]) => {
                    if (key === "author_ids") {
                        value.forEach((v) => payload.append("author_ids[]", v));
                    } else if (value !== "" && value !== null) {
                        payload.append(key, value);
                    }
                });
                payload.append("file", file);
                if (cover) payload.append("cover", cover);

                const created = await api.createDocument(payload);
                if (onImported) onImported(created);
                else navigate(listPath);
            }
        } catch (err) {
            setError(
                err.data?.errors
                    ? Object.values(err.data.errors)[0][0]
                    : err.status === 403
                      ? err.data?.message || "Action non autorisée."
                      : "L'enregistrement a échoué.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            {!isEditing && !importItem && (
                <div className="mx-auto mb-3 flex w-full max-w-5xl justify-end">
                    <Link to={`${listPath}/importer`} className="btn-secondary">
                        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                        Importer des documents
                    </Link>
                </div>
            )}
            <form
                onSubmit={handleSubmit}
                className="mx-auto w-full max-w-5xl space-y-2.5 rounded-xl border border-line bg-paper p-3.5"
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            Titre *
                        </label>
                        <input
                            required
                            value={form.title}
                            onChange={(e) =>
                                setForm({ ...form, title: e.target.value })
                            }
                            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            Sous-titre
                        </label>
                        <input
                            value={form.subtitle}
                            onChange={(e) =>
                                setForm({ ...form, subtitle: e.target.value })
                            }
                            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-ink-soft mb-1.5">
                        Résumé
                    </label>
                    <RichTextEditor
                        value={form.abstract}
                        onChange={(html) =>
                            setForm((prev) => ({ ...prev, abstract: html }))
                        }
                    />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                        <label htmlFor="doc-type" className="block text-sm text-ink-soft mb-1.5">
                            Type *
                        </label>
                        <select
                            id="doc-type"
                            required
                            value={typeOther ? "Autre" : form.type}
                            onChange={(e) => {
                                const v = e.target.value;
                                setTypeOther(v === "Autre");
                                setForm({ ...form, type: v === "Autre" ? "" : v });
                            }}
                            className={inputClass}
                        >
                            <option value="">—</option>
                            {TYPE_OPTIONS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        {typeOther && (
                            <input
                                required
                                maxLength={100}
                                autoFocus
                                placeholder="Précisez le type"
                                value={form.type}
                                onChange={(e) =>
                                    setForm({ ...form, type: e.target.value })
                                }
                                className={`${inputClass} mt-2`}
                            />
                        )}
                    </div>

                    <div>
                        <label htmlFor="doc-niveau" className="block text-sm text-ink-soft mb-1.5">
                            Niveau
                        </label>
                        <select
                            id="doc-niveau"
                            value={form.niveau}
                            onChange={(e) =>
                                setForm({ ...form, niveau: e.target.value })
                            }
                            className={inputClass}
                        >
                            <option value="">—</option>
                            {NIVEAU_OPTIONS.map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="doc-category" className="block text-sm text-ink-soft mb-1.5">
                            Catégorie *
                        </label>
                        <select
                            id="doc-category"
                            required
                            value={categoryOther ? "Autre" : form.category}
                            onChange={(e) => {
                                const v = e.target.value;
                                setCategoryOther(v === "Autre");
                                setForm({ ...form, category: v === "Autre" ? "" : v });
                            }}
                            className={inputClass}
                        >
                            <option value="">—</option>
                            {CATEGORY_OPTIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        {categoryOther && (
                            <input
                                required
                                maxLength={255}
                                autoFocus
                                placeholder="Précisez la catégorie"
                                value={form.category}
                                onChange={(e) =>
                                    setForm({ ...form, category: e.target.value })
                                }
                                className={`${inputClass} mt-2`}
                            />
                        )}
                    </div>

                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            Bibliothèque *
                        </label>
                        <select
                            required
                            value={form.library_id}
                            onChange={(e) =>
                                setForm({ ...form, library_id: e.target.value })
                            }
                            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                        >
                            <option value="">—</option>
                            {libraries.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            Année
                        </label>
                        <input
                            value={form.year}
                            onChange={(e) =>
                                setForm({ ...form, year: e.target.value })
                            }
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            Éditeur
                        </label>
                        <input
                            value={form.publisher}
                            onChange={(e) =>
                                setForm({ ...form, publisher: e.target.value })
                            }
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            ISBN
                        </label>
                        <input
                            value={form.isbn}
                            onChange={(e) =>
                                setForm({ ...form, isbn: e.target.value })
                            }
                            className={inputClass}
                        />
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor="doc-language" className="block text-sm text-ink-soft mb-1.5">
                            Langue *
                        </label>
                        <input
                            id="doc-language"
                            required
                            maxLength={50}
                            value={form.language}
                            onChange={(e) =>
                                setForm({ ...form, language: e.target.value })
                            }
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-ink-soft mb-1.5">
                            Niveau d'accès *
                        </label>
                        <select
                            value={form.access_level}
                            onChange={(e) =>
                                setForm({ ...form, access_level: e.target.value })
                            }
                            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                        >
                            {ACCESS_LEVELS.map((a) => (
                                <option key={a.value} value={a.value}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-ink-soft mb-1.5">
                        Auteur(s)
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {authors.map((a) => (
                            <button
                                type="button"
                                key={a.id}
                                onClick={() => toggleAuthor(a.id)}
                                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                                    form.author_ids.includes(a.id)
                                        ? "bg-ink text-paper border-ink"
                                        : "border-line text-ink-soft hover:border-brass"
                                }`}
                            >
                                {a.name}
                            </button>
                        ))}
                        {pendingAuthors.map((name) => (
                            <span
                                key={name}
                                title="Nouvel auteur : il sera créé à l'enregistrement du document"
                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-brass bg-indigo-50 px-3 py-1 text-sm text-ink"
                            >
                                Nouveau : {name}
                                <button
                                    type="button"
                                    onClick={() => setPendingAuthors((prev) => prev.filter((n) => n !== name))}
                                    className="rounded-full text-ink-soft hover:text-ink"
                                    aria-label={`Retirer l'auteur ${name}`}
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                            value={newAuthor}
                            onChange={(e) => setNewAuthor(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addAuthor();
                                }
                            }}
                            placeholder="Nom d'un nouvel auteur"
                            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                        />
                        <button
                            type="button"
                            onClick={addAuthor}
                            className="btn-secondary"
                        >
                            + Ajouter un auteur
                        </button>
                    </div>
                    {authorError && (
                        <p className="mt-2 text-sm text-rose-700">
                            {authorError}
                        </p>
                    )}
                </div>

                {!isEditing && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-sm text-ink-soft mb-1.5">
                                Fichier PDF *
                            </label>
                            <label className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-paper-dim px-3 py-3 cursor-pointer hover:border-brass transition-colors">
                                <UploadCloud
                                    className="h-5 w-5 flex-shrink-0 text-slate-400"
                                    strokeWidth={1.5}
                                />
                                <span className="text-sm text-ink-soft">
                                    {file
                                        ? `${importItem ? "✓ " : ""}${file.name}`
                                        : "PDF (obligatoire, 50 Mo max)"}
                                </span>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    required={!file}
                                    onChange={(e) => setFile(e.target.files[0])}
                                    className="sr-only"
                                />
                            </label>
                        </div>
                        <div>
                            <label className="block text-sm text-ink-soft mb-1.5">
                                Couverture (optionnel)
                            </label>
                            <label className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-paper-dim px-3 py-3 cursor-pointer hover:border-brass transition-colors">
                                <ImageIcon
                                    className="h-5 w-5 flex-shrink-0 text-slate-400"
                                    strokeWidth={1.5}
                                />
                                <span className="text-sm text-ink-soft">
                                    {cover
                                        ? `${importItem ? "✓ " : ""}${cover.name}`
                                        : "Choisir une image"}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                        setCover(e.target.files[0])
                                    }
                                    className="sr-only"
                                />
                            </label>
                        </div>
                    </div>
                )}

                {isEditing && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-sm text-ink-soft mb-1.5">
                                Remplacer le PDF (optionnel)
                            </label>
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) =>
                                    setFile(e.target.files?.[0] || null)
                                }
                                className="w-full text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-ink-soft mb-1.5">
                                Remplacer la couverture (optionnel)
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                    setCover(e.target.files?.[0] || null)
                                }
                                className="w-full text-sm"
                            />
                        </div>
                    </div>
                )}

                {error && <p className="text-sm text-red-700">{error}</p>}

                <div className="flex justify-center">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="btn-primary disabled:opacity-50"
                    >
                        {submitting
                            ? "Enregistrement…"
                            : isEditing
                              ? "Enregistrer les modifications"
                              : "Créer le document (brouillon)"}
                    </button>
                </div>
            </form>
        </div>
    );
}
