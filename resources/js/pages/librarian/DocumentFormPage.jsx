import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { UploadCloud, Image as ImageIcon, FileSpreadsheet, FileCheck2, X, Check, Plus, Search, Globe, Users, Lock } from "lucide-react";
import { api } from "../../lib/api";
import RichTextEditor from "../../components/RichTextEditor";
import AiCoverGenerator from "../../components/AiCoverGenerator";

// Langue reste un champ libre. Les anciens documents contiennent des codes
// (« memoire », « fr ») : on affiche leur libellé à la modification.
const LEGACY_TYPE_LABELS = { livre: "Livre", memoire: "Mémoire", these: "Thèse", rapport: "Rapport", autre: "Autre" };
const LEGACY_LANGUAGE_LABELS = { fr: "Français", mg: "Malgache", en: "Anglais", es: "Espagnol", pt: "Portugais", it: "Italien", ru: "Russe", autre: "Autre" };

// Listes également utilisées par l'importation Excel (DocumentImportService.php) : à garder synchronisées.
const TYPE_OPTIONS = ["Mémoire", "Livre", "Thèse", "Rapport", "Document", "Autre"];
const NIVEAU_OPTIONS = ["L1", "L2", "L3", "M1", "M2", "Doctorat"];
const CATEGORY_OPTIONS = ["Agronomie", "Droit", "Finance", "Informatique", "Lettres et sciences humaines", "Médecine", "Autre"];

const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";
const labelClass = "mb-1.5 block text-sm font-semibold text-ink";

// Limites du serveur (règles « file » et « cover » de DocumentController).
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

const ACCESS_LEVELS = [
    { value: "public", label: "Public", hint: "Aucune connexion requise", Icon: Globe },
    { value: "authentifie", label: "Authentifié", hint: "Tout utilisateur connecté", Icon: Users },
    { value: "restreint", label: "Restreint", hint: "Uniquement sa bibliothèque", Icon: Lock },
];

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

function Panel({ title, children, className = "" }) {
    return (
        <section className={`space-y-3.5 rounded-xl border border-line bg-surface p-4 ${className}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">{title}</h3>
            {children}
        </section>
    );
}

/**
 * Zone de dépôt d'un fichier (clic ou glisser-déposer). `accepts` filtre les fichiers
 * déposés, que l'attribut `accept` de l'input ne contrôle pas.
 */
function FileDrop({ accept, accepts, file, onFile, required, maxBytes, Icon, emptyTitle, emptyHint, fromImport }) {
    const [over, setOver] = useState(false);
    const tooBig = file && file.size > maxBytes;

    function handleDrop(e) {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped && accepts(dropped)) onFile(dropped);
    }

    return (
        <label
            onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-indigo-200 ${
                file
                    ? tooBig
                        ? "border-solid border-rose-300 bg-rose-50"
                        : "border-solid border-emerald-300 bg-emerald-50"
                    : over
                      ? "border-dashed border-indigo-400 bg-indigo-100"
                      : "border-dashed border-line bg-paper hover:border-indigo-400"
            }`}
        >
            <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                    file ? (tooBig ? "bg-surface text-rose-700" : "bg-surface text-emerald-700") : "bg-paper-dim text-indigo-600"
                }`}
            >
                {file ? <FileCheck2 className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
            </span>
            <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-semibold text-ink">{file ? file.name : emptyTitle}</span>
                <span className={`text-xs ${tooBig ? "text-rose-700" : "text-ink-soft"}`}>
                    {file
                        ? tooBig
                            ? `${formatSize(file.size)} : trop volumineux (${formatSize(maxBytes)} max)`
                            : `${formatSize(file.size)}${fromImport ? " · associé depuis l'Excel" : ""} · cliquer pour changer`
                        : emptyHint}
                </span>
            </span>
            <input
                type="file"
                accept={accept}
                required={required && !file}
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                className="sr-only"
            />
        </label>
    );
}

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
    const [authorQuery, setAuthorQuery] = useState("");
    const [activeOption, setActiveOption] = useState(0);
    const [authorError, setAuthorError] = useState(null);
    const [coverPreview, setCoverPreview] = useState(null);
    const [existingCoverUrl, setExistingCoverUrl] = useState(null);
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
                setExistingCoverUrl(doc.cover_path ? `/storage/${doc.cover_path}` : null);
                // Document déjà existant avec un type/catégorie hors des options
                // prédéfinies (ancienne saisie libre) : on garde sa valeur exacte
                // via le champ "Autre" plutôt que de la perdre silencieusement.
                setTypeOther(type !== "" && !TYPE_OPTIONS.includes(type));
                setCategoryOther(category !== "" && !CATEGORY_OPTIONS.includes(category));
            }).catch((e) => setError(e.data?.message || "Impossible de charger ce document."));
        }
    }, [id]);

    // Aperçu de la couverture choisie (fichier local ou image générée par l'IA).
    useEffect(() => {
        if (!cover) {
            setCoverPreview(null);
            return undefined;
        }
        const url = URL.createObjectURL(cover);
        setCoverPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [cover]);

    function toggleAuthor(authorId) {
        setForm((prev) => ({
            ...prev,
            author_ids: prev.author_ids.includes(authorId)
                ? prev.author_ids.filter((a) => a !== authorId)
                : [...prev.author_ids, authorId],
        }));
    }

    async function addAuthor(rawName) {
        const name = rawName.trim();

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

            setAuthorQuery("");
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

        // Mêmes limites que le serveur (DocumentController : PDF 50 Mo, couverture 5 Mo) :
        // refusé tout de suite plutôt qu'après un long envoi.
        if (file && file.size > MAX_PDF_BYTES) {
            setError("Le PDF dépasse 50 Mo.");
            return;
        }
        if (cover && cover.size > MAX_COVER_BYTES) {
            setError("La couverture dépasse 5 Mo.");
            return;
        }

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
                      : err.status === 413
                        ? "Les fichiers sont trop volumineux pour le serveur (limite d'envoi de PHP : post_max_size / upload_max_filesize)."
                        : "L'enregistrement a échoué.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    // Recherche d'auteurs : suggestions parmi ceux qui ne sont pas encore choisis,
    // et création d'un nouvel auteur quand le nom saisi n'existe pas.
    const query = authorQuery.trim().toLowerCase();
    const selectedAuthors = form.author_ids
        .map((authorId) => authors.find((a) => a.id === authorId))
        .filter(Boolean);
    const nameExists =
        authors.some((a) => String(a.name).trim().toLowerCase() === query) ||
        pendingAuthors.some((n) => n.trim().toLowerCase() === query);
    const authorOptions = query
        ? [
              ...authors
                  .filter((a) => !form.author_ids.includes(a.id) && String(a.name).toLowerCase().includes(query))
                  .slice(0, 6)
                  .map((a) => ({ key: a.id, author: a })),
              ...(nameExists ? [] : [{ key: "create", author: null }]),
          ]
        : [];

    function chooseOption(option) {
        if (option.author) {
            toggleAuthor(option.author.id);
            setAuthorQuery("");
        } else {
            addAuthor(authorQuery);
        }
        setActiveOption(0);
    }

    const checks = [
        { label: "Titre", ok: form.title.trim() !== "" },
        { label: "Type et catégorie", ok: form.type.trim() !== "" && form.category.trim() !== "" },
        { label: "Bibliothèque et langue", ok: String(form.library_id) !== "" && form.language.trim() !== "" },
        ...(isEditing ? [] : [{ label: "Fichier PDF", ok: Boolean(file) }]),
    ];

    const coverUrl = coverPreview || existingCoverUrl;
    const coverMeta = [form.type, form.niveau, form.year].filter(Boolean).join(" · ");

    return (
        <div>
            {!isEditing && !importItem && (
                <div className="mx-auto mb-3 flex w-full max-w-6xl justify-end">
                    <Link to={`${listPath}/importer`} className="btn-secondary">
                        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                        Importer des documents
                    </Link>
                </div>
            )}
            <form
                onSubmit={handleSubmit}
                className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
            >
                <div className="min-w-0 space-y-4">
                    <Panel title="Informations">
                        <div>
                            <label htmlFor="doc-title" className={labelClass}>
                                Titre <span className="text-brass">*</span>
                            </label>
                            <input
                                id="doc-title"
                                required
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label htmlFor="doc-subtitle" className={labelClass}>
                                Sous-titre
                            </label>
                            <input
                                id="doc-subtitle"
                                value={form.subtitle}
                                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <span className={labelClass}>Résumé</span>
                            <RichTextEditor
                                value={form.abstract}
                                onChange={(html) => setForm((prev) => ({ ...prev, abstract: html }))}
                            />
                        </div>
                    </Panel>

                    <Panel title="Classement">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor="doc-type" className={labelClass}>
                                    Type <span className="text-brass">*</span>
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
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                        className={`${inputClass} mt-2`}
                                    />
                                )}
                            </div>

                            <div>
                                <label htmlFor="doc-niveau" className={labelClass}>
                                    Niveau
                                </label>
                                <select
                                    id="doc-niveau"
                                    value={form.niveau}
                                    onChange={(e) => setForm({ ...form, niveau: e.target.value })}
                                    className={inputClass}
                                >
                                    <option value="">—</option>
                                    {NIVEAU_OPTIONS.map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="doc-category" className={labelClass}>
                                    Catégorie <span className="text-brass">*</span>
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
                                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                                        className={`${inputClass} mt-2`}
                                    />
                                )}
                            </div>

                            <div>
                                <label htmlFor="doc-library" className={labelClass}>
                                    Bibliothèque <span className="text-brass">*</span>
                                </label>
                                <select
                                    id="doc-library"
                                    required
                                    value={form.library_id}
                                    onChange={(e) => setForm({ ...form, library_id: e.target.value })}
                                    className={inputClass}
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
                    </Panel>

                    <Panel title="Édition">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <label htmlFor="doc-year" className={labelClass}>
                                    Année
                                </label>
                                <input
                                    id="doc-year"
                                    inputMode="numeric"
                                    value={form.year}
                                    onChange={(e) => setForm({ ...form, year: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor="doc-publisher" className={labelClass}>
                                    Éditeur
                                </label>
                                <input
                                    id="doc-publisher"
                                    value={form.publisher}
                                    onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor="doc-isbn" className={labelClass}>
                                    ISBN
                                </label>
                                <input
                                    id="doc-isbn"
                                    value={form.isbn}
                                    onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor="doc-language" className={labelClass}>
                                    Langue <span className="text-brass">*</span>
                                </label>
                                <input
                                    id="doc-language"
                                    required
                                    maxLength={50}
                                    value={form.language}
                                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Auteurs">
                        <div className="relative">
                            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface p-1.5 focus-within:ring-2 focus-within:ring-indigo-200">
                                {selectedAuthors.map((a) => (
                                    <span
                                        key={a.id}
                                        className="inline-flex items-center gap-1 rounded-full bg-indigo-600 py-1 pl-3 pr-1.5 text-sm text-white"
                                    >
                                        {a.name}
                                        <button
                                            type="button"
                                            onClick={() => toggleAuthor(a.id)}
                                            className="rounded-full p-0.5 hover:bg-indigo-500"
                                            aria-label={`Retirer l'auteur ${a.name}`}
                                        >
                                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </span>
                                ))}
                                {pendingAuthors.map((name) => (
                                    <span
                                        key={name}
                                        title="Nouvel auteur : il sera créé à l'enregistrement du document"
                                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-brass bg-amber-50 py-1 pl-3 pr-1.5 text-sm text-ink"
                                    >
                                        Nouveau : {name}
                                        <button
                                            type="button"
                                            onClick={() => setPendingAuthors((prev) => prev.filter((n) => n !== name))}
                                            className="rounded-full p-0.5 text-ink-soft hover:text-ink"
                                            aria-label={`Retirer l'auteur ${name}`}
                                        >
                                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </span>
                                ))}
                                <span className="flex min-w-48 flex-1 items-center gap-2 px-1.5">
                                    <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
                                    <input
                                        id="doc-authors"
                                        role="combobox"
                                        aria-expanded={authorOptions.length > 0}
                                        aria-controls="doc-authors-options"
                                        aria-label="Rechercher ou ajouter un auteur"
                                        autoComplete="off"
                                        value={authorQuery}
                                        onChange={(e) => {
                                            setAuthorQuery(e.target.value);
                                            setActiveOption(0);
                                            setAuthorError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "ArrowDown" && authorOptions.length) {
                                                e.preventDefault();
                                                setActiveOption((i) => (i + 1) % authorOptions.length);
                                            } else if (e.key === "ArrowUp" && authorOptions.length) {
                                                e.preventDefault();
                                                setActiveOption((i) => (i - 1 + authorOptions.length) % authorOptions.length);
                                            } else if (e.key === "Enter") {
                                                e.preventDefault();
                                                if (authorOptions[activeOption]) chooseOption(authorOptions[activeOption]);
                                            } else if (e.key === "Escape") {
                                                setAuthorQuery("");
                                            }
                                        }}
                                        placeholder="Rechercher ou ajouter un auteur…"
                                        className="min-w-0 flex-1 bg-transparent py-1 text-sm focus:outline-none"
                                    />
                                </span>
                            </div>
                            {authorOptions.length > 0 && (
                                <ul
                                    id="doc-authors-options"
                                    role="listbox"
                                    className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-surface text-sm"
                                >
                                    {authorOptions.map((option, i) => (
                                        <li
                                            key={option.key}
                                            role="option"
                                            aria-selected={i === activeOption}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                chooseOption(option);
                                            }}
                                            onMouseEnter={() => setActiveOption(i)}
                                            className={`flex cursor-pointer items-center gap-2 border-t border-line px-3 py-2 first:border-t-0 ${
                                                i === activeOption ? "bg-paper-dim" : ""
                                            }`}
                                        >
                                            {option.author ? (
                                                option.author.name
                                            ) : (
                                                <>
                                                    <Plus className="h-4 w-4 text-brass" aria-hidden="true" />
                                                    Créer l'auteur « {authorQuery.trim()} »
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <p className="text-xs text-ink-soft">
                            Tapez un nom puis Entrée : s'il n'existe pas encore, l'auteur est créé.
                        </p>
                        {authorError && <p className="text-sm text-rose-700">{authorError}</p>}
                    </Panel>

                    <Panel title="Niveau d'accès *">
                        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Niveau d'accès">
                            {ACCESS_LEVELS.map(({ value, label, hint, Icon }) => {
                                const selected = form.access_level === value;
                                return (
                                    <label
                                        key={value}
                                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-indigo-200 ${
                                            selected ? "border-indigo-400 bg-indigo-100" : "border-line hover:border-indigo-400"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="access_level"
                                            value={value}
                                            checked={selected}
                                            onChange={() => setForm({ ...form, access_level: value })}
                                            className="sr-only"
                                        />
                                        <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-indigo-400" : "text-ink-soft"}`} aria-hidden="true" />
                                        <span className="grid min-w-0 flex-1">
                                            <span className="text-sm font-semibold text-ink">{label}</span>
                                            <span className="text-xs text-ink-soft">{hint}</span>
                                        </span>
                                        <span
                                            className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                                                selected ? "border-indigo-400" : "border-line"
                                            }`}
                                            aria-hidden="true"
                                        >
                                            {selected && <span className="h-2 w-2 rounded-full bg-indigo-400" />}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </Panel>
                </div>

                <aside className="min-w-0 space-y-4">
                    <Panel title={isEditing ? "Remplacer le PDF (optionnel)" : "Fichier PDF *"}>
                        <FileDrop
                            accept="application/pdf"
                            accepts={(f) => f.type === "application/pdf"}
                            file={file}
                            onFile={setFile}
                            required={!isEditing}
                            maxBytes={MAX_PDF_BYTES}
                            Icon={UploadCloud}
                            emptyTitle={isEditing ? "Garder le PDF actuel" : "Glissez le PDF ici"}
                            emptyHint={isEditing ? "ou cliquez pour en choisir un autre · 50 Mo max" : "ou cliquez pour choisir · 50 Mo max"}
                            fromImport={Boolean(importItem?.file) && file === importItem.file}
                        />
                    </Panel>

                    <Panel title={isEditing ? "Couverture" : "Couverture (optionnel)"}>
                        <div className="flex items-start gap-3">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt="Aperçu de la couverture"
                                    className="aspect-3/4 w-24 shrink-0 rounded-lg border border-line object-cover"
                                />
                            ) : (
                                <div
                                    className="flex aspect-3/4 w-24 shrink-0 flex-col justify-end rounded-lg bg-indigo-600 p-2.5 text-white"
                                    aria-label="Aperçu sans couverture"
                                >
                                    <span className="line-clamp-4 text-xs font-extrabold leading-snug">
                                        {form.title.trim() || "Titre du document"}
                                    </span>
                                    {coverMeta && <span className="mt-1 text-[10px] text-on-primary-soft">{coverMeta}</span>}
                                </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-2">
                                <FileDrop
                                    accept="image/*"
                                    accepts={(f) => f.type.startsWith("image/")}
                                    file={cover}
                                    onFile={setCover}
                                    maxBytes={MAX_COVER_BYTES}
                                    Icon={ImageIcon}
                                    emptyTitle={isEditing ? "Remplacer l'image" : "Choisir une image"}
                                    emptyHint="JPG, PNG ou WebP · 5 Mo max"
                                    fromImport={Boolean(importItem?.cover) && cover === importItem.cover}
                                />
                                {cover && (
                                    <button
                                        type="button"
                                        onClick={() => setCover(null)}
                                        className="text-sm font-semibold text-brass hover:text-brass-deep"
                                    >
                                        {isEditing ? "Annuler le remplacement" : "Retirer"}
                                    </button>
                                )}
                            </div>
                        </div>
                        <AiCoverGenerator
                            fields={{
                                title: form.title,
                                subtitle: form.subtitle,
                                type: form.type,
                                category: form.category,
                                abstract: form.abstract,
                                keywords: form.keywords,
                            }}
                            current={cover}
                            onUse={setCover}
                        />
                    </Panel>

                    <Panel title={isEditing ? "Enregistrer" : "Avant de créer"} className="lg:sticky lg:top-4">
                        <ul className="space-y-1.5 text-sm">
                            {checks.map(({ label, ok }) => (
                                <li key={label} className={`flex items-center gap-2 ${ok ? "text-ink" : "text-ink-soft"}`}>
                                    <span
                                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                                            ok ? "border-emerald-600 bg-emerald-600 text-white" : "border-line"
                                        }`}
                                        aria-hidden="true"
                                    >
                                        {ok && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                                    </span>
                                    {label}
                                    <span className="sr-only">{ok ? " : rempli" : " : à remplir"}</span>
                                </li>
                            ))}
                        </ul>

                        {error && <p className="text-sm text-red-700">{error}</p>}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-primary w-full py-2.5! disabled:opacity-50"
                        >
                            {submitting
                                ? "Enregistrement…"
                                : isEditing
                                  ? "Enregistrer les modifications"
                                  : "Créer le document"}
                        </button>
                        {!isEditing && <p className="text-center text-xs text-ink-soft">Le document est créé en brouillon.</p>}
                    </Panel>
                </aside>
            </form>
        </div>
    );
}
