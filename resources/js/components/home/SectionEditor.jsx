import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { SECTION_TYPES, STYLE_OPTIONS, homepageImageUrl, safeLink } from "../../lib/homepage";

/**
 * Formulaire d'une section : uniquement les champs prévus par son type (lib/homepage.js),
 * plus quelques styles à valeurs contrôlées. Aucun HTML, CSS ou JavaScript libre.
 * errors : messages du serveur indexés par chemin relatif (« content.title », « style.bg_color »).
 */

const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

const STYLE_LABELS = {
    align: "Alignement",
    title_size: "Taille du titre",
    title_weight: "Épaisseur du titre",
    spacing: "Espacement",
    text_color: "Couleur du texte",
    bg_color: "Couleur de fond",
    button_color: "Couleur du bouton",
};

const COLOR_DEFAULTS = { text_color: "#1f2937", bg_color: "#eef2ff", button_color: "#4f46e5" };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function FieldError({ errors, path }) {
    const messages = errors?.[path];
    if (!messages?.length) return null;
    return <p className="mt-1 text-xs font-semibold text-rose-700">{messages[0]}</p>;
}

function ImageField({ field, value, onChange }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const src = homepageImageUrl(value) || field.fallback;

    async function pick(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
            setError("Format accepté : JPG, PNG ou WebP.");
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setError("Image trop lourde (4 Mo maximum).");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const { path } = await api.uploadHomepageImage(file);
            onChange(path);
        } catch (e) {
            setError(e.data?.errors?.image?.[0] || e.message || "Téléversement impossible.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {src ? (
                        <img src={src} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <ImagePlus className="h-6 w-6 text-slate-400" />
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-sm">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {value || field.fallback ? "Remplacer" : "Choisir une image"}
                    </button>
                    {value && (
                        <button type="button" onClick={() => onChange(null)} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-sm">
                            <X className="h-4 w-4" />
                            {field.fallback ? "Image par défaut" : "Retirer"}
                        </button>
                    )}
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="sr-only" tabIndex={-1} />
            <p className="mt-1 text-xs text-slate-500">JPG, PNG ou WebP — 4 Mo maximum.</p>
            {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
        </div>
    );
}

function ListField({ field, value = [], onChange, id }) {
    const items = value.length ? value : [""];

    return (
        <div className="space-y-2">
            {items.map((item, index) => (
                <div key={index} className="flex gap-2">
                    <input
                        id={index === 0 ? id : undefined}
                        value={item}
                        maxLength={field.max}
                        onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
                        className={inputClass}
                    />
                    <button
                        type="button"
                        onClick={() => onChange(items.filter((_, i) => i !== index))}
                        className="btn-secondary !px-2.5 !py-1.5"
                        aria-label="Retirer"
                        title="Retirer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ))}
            {items.length < field.maxItems && (
                <button type="button" onClick={() => onChange([...items, ""])} className="inline-flex items-center gap-1 text-sm font-semibold text-brass">
                    <Plus className="h-4 w-4" /> Ajouter
                </button>
            )}
        </div>
    );
}

function CardsField({ field, value = [], onChange, errors, path }) {
    const update = (index, key, text) => onChange(value.map((card, i) => (i === index ? { ...card, [key]: text } : card)));

    return (
        <div className="space-y-3">
            {value.map((card, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">Carte {index + 1}</span>
                        <button
                            type="button"
                            onClick={() => onChange(value.filter((_, i) => i !== index))}
                            className="text-rose-700"
                            aria-label={`Supprimer la carte ${index + 1}`}
                            title="Supprimer la carte"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        <input placeholder="Titre" value={card.title || ""} maxLength={80} onChange={(e) => update(index, "title", e.target.value)} className={inputClass} aria-label={`Titre de la carte ${index + 1}`} />
                        <textarea placeholder="Texte" value={card.text || ""} maxLength={300} rows={2} onChange={(e) => update(index, "text", e.target.value)} className={inputClass} aria-label={`Texte de la carte ${index + 1}`} />
                        <input placeholder="Lien (facultatif) : /recherche ou https://…" value={card.link || ""} maxLength={500} onChange={(e) => update(index, "link", e.target.value)} className={inputClass} aria-label={`Lien de la carte ${index + 1}`} />
                        {card.link && !safeLink(card.link) && <p className="text-xs font-semibold text-rose-700">Lien invalide.</p>}
                        <FieldError errors={errors} path={`${path}.${index}.link`} />
                    </div>
                </div>
            ))}
            {value.length < field.maxItems && (
                <button
                    type="button"
                    onClick={() => onChange([...value, { title: "", text: "", link: "" }])}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brass"
                >
                    <Plus className="h-4 w-4" /> Ajouter une carte
                </button>
            )}
        </div>
    );
}

function ContentField({ field, value, onChange, errors }) {
    const id = useId();
    const path = `content.${field.name}`;

    if (field.kind === "bool") {
        return (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                {field.label}
            </label>
        );
    }

    let control;
    switch (field.kind) {
        case "textarea":
            control = <textarea id={id} value={value || ""} maxLength={field.max} rows={field.rows || 3} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
            break;
        case "int":
            control = (
                <input
                    id={id}
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                    onBlur={() => value != null && onChange(Math.min(field.max, Math.max(field.min, Math.round(value))))}
                    className={`${inputClass} max-w-32`}
                />
            );
            break;
        case "link":
            control = (
                <>
                    <input id={id} value={value || ""} maxLength={500} placeholder="/recherche ou https://…" onChange={(e) => onChange(e.target.value)} className={inputClass} />
                    {value && !safeLink(value) && <p className="mt-1 text-xs font-semibold text-rose-700">Lien invalide : adresse interne (/page) ou externe (https://…).</p>}
                </>
            );
            break;
        case "image":
            control = <ImageField field={field} value={value} onChange={onChange} />;
            break;
        case "list":
            control = <ListField field={field} value={value} onChange={onChange} id={id} />;
            break;
        case "cards":
            control = <CardsField field={field} value={value} onChange={onChange} errors={errors} path={path} />;
            break;
        default:
            control = <input id={id} value={value || ""} maxLength={field.max} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    }

    return (
        <div>
            <label htmlFor={id} className={labelClass}>
                {field.label}
            </label>
            {control}
            {field.help && <p className="mt-1 text-xs text-slate-500">{field.help}</p>}
            <FieldError errors={errors} path={path} />
        </div>
    );
}

function StyleField({ name, value, onChange, errors }) {
    const id = useId();

    if (STYLE_OPTIONS[name]) {
        return (
            <div>
                <label htmlFor={id} className={labelClass}>{STYLE_LABELS[name]}</label>
                <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
                    <option value="">Par défaut</option>
                    {STYLE_OPTIONS[name].map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                    ))}
                </select>
                <FieldError errors={errors} path={`style.${name}`} />
            </div>
        );
    }

    return (
        <div>
            <label htmlFor={id} className={labelClass}>{STYLE_LABELS[name]}</label>
            <div className="flex items-center gap-2">
                {value ? (
                    <>
                        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-surface p-0.5" />
                        <span className="font-mono text-xs text-slate-500">{value}</span>
                        <button type="button" onClick={() => onChange(null)} className="text-slate-500 hover:text-slate-800" title="Revenir à la couleur par défaut" aria-label="Revenir à la couleur par défaut">
                            <RotateCcw className="h-4 w-4" />
                        </button>
                    </>
                ) : (
                    <button id={id} type="button" onClick={() => onChange(COLOR_DEFAULTS[name])} className="btn-secondary !px-3 !py-1.5 text-sm">
                        Par défaut — personnaliser
                    </button>
                )}
            </div>
            <FieldError errors={errors} path={`style.${name}`} />
        </div>
    );
}

export default function SectionEditor({ section, onChange, errors }) {
    const type = SECTION_TYPES[section.type];
    const setContent = (name, value) => onChange({ ...section, content: { ...section.content, [name]: value } });
    const setStyle = (name, value) => onChange({ ...section, style: { ...section.style, [name]: value } });
    const hasColor = ["text_color", "bg_color"].some((name) => type.styles.includes(name));

    return (
        <div className="space-y-4">
            {type.fields.map((field) => (
                <ContentField
                    key={field.name}
                    field={field}
                    value={section.content?.[field.name]}
                    onChange={(value) => setContent(field.name, value)}
                    errors={errors}
                />
            ))}

            <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-bold text-slate-700">Style</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {type.styles.map((name) => (
                        <StyleField key={name} name={name} value={section.style?.[name]} onChange={(value) => setStyle(name, value)} errors={errors} />
                    ))}
                </div>
                {hasColor && section.type !== "hero" && (
                    <p className="mt-3 text-xs text-slate-500">
                        La couleur du texte s'applique uniquement si une couleur de fond est choisie, pour rester lisible en mode sombre.
                    </p>
                )}
            </details>
        </div>
    );
}
