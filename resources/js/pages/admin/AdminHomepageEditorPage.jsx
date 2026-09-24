import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ChevronDown,
    Eye,
    EyeOff,
    GripVertical,
    History,
    Loader2,
    Plus,
    Rocket,
    Save,
    Trash2,
    Undo2,
    X,
} from "lucide-react";
import { api } from "../../lib/api";
import { DEFAULT_SECTIONS, SECTION_TYPES, createSection, sectionSummary } from "../../lib/homepage";
import SectionEditor from "../../components/home/SectionEditor";
import HomepagePreviewFrame from "../../components/home/HomepagePreviewFrame";
import HomepageVersionsDialog from "../../components/home/HomepageVersionsDialog";

const formatDate = (value) =>
    value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";

// Erreurs du serveur (« sections.3.content.title ») regroupées par identifiant de section.
function groupErrors(errors, sections) {
    const grouped = {};
    for (const [key, messages] of Object.entries(errors || {})) {
        const match = key.match(/^sections\.(\d+)\.(.+)$/);
        const section = match && sections[Number(match[1])];
        if (!section) continue;
        grouped[section.id] ??= {};
        grouped[section.id][match[2]] = messages;
    }
    return grouped;
}

function AddSectionDialog({ onAdd, onClose }) {
    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label="Ajouter une section" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="font-display text-lg font-extrabold">Ajouter une section</h3>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="btn-secondary !px-3 !py-2">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(SECTION_TYPES).map(([type, { label, description, icon: Icon }]) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => onAdd(type)}
                            className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-brass">
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-bold text-slate-900">{label}</span>
                                <span className="block text-xs text-slate-500">{description}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function AdminHomepageEditorPage() {
    const [loading, setLoading] = useState(true);
    const [sections, setSections] = useState([]);
    const [savedJson, setSavedJson] = useState("[]"); // dernier état enregistré (brouillon ou version publiée)
    const [draft, setDraft] = useState(null);
    const [published, setPublished] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [inspecting, setInspecting] = useState(null); // version consultée dans l'aperçu
    const [mobileTab, setMobileTab] = useState("editor");
    const [dragIndex, setDragIndex] = useState(null);
    const [dropIndex, setDropIndex] = useState(null);

    const dirty = useMemo(() => JSON.stringify(sections) !== savedJson, [sections, savedJson]);

    function applyState({ draft: nextDraft, published: nextPublished }) {
        const next = nextDraft?.sections ?? nextPublished?.sections ?? DEFAULT_SECTIONS;
        setDraft(nextDraft);
        setPublished(nextPublished);
        setSections(next);
        setSavedJson(JSON.stringify(next));
        setErrors({});
    }

    useEffect(() => {
        api.getHomepageAdmin()
            .then(applyState)
            .catch((e) => setNotice({ type: "error", text: e.message || "Chargement impossible." }))
            .finally(() => setLoading(false));
    }, []);

    // Avertit avant de quitter la page avec des modifications non enregistrées.
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (event) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const updateSection = (id, next) => setSections((list) => list.map((s) => (s.id === id ? next : s)));

    function move(from, to) {
        if (to < 0 || to >= sections.length || from === to) return;
        setSections((list) => {
            const copy = [...list];
            const [item] = copy.splice(from, 1);
            copy.splice(to, 0, item);
            return copy;
        });
    }

    function addSection(type) {
        const section = createSection(type);
        setSections((list) => [...list, section]);
        setExpandedId(section.id);
        setShowAdd(false);
    }

    function removeSection(section) {
        const label = sectionSummary(section) || SECTION_TYPES[section.type].label;
        if (!window.confirm(`Supprimer la section « ${label} » ? Vous pouvez la masquer à la place pour garder son contenu.`)) return;
        setSections((list) => list.filter((s) => s.id !== section.id));
    }

    async function saveDraft() {
        setBusy("save");
        setNotice(null);
        try {
            const response = await api.saveHomepageDraft(sections);
            setDraft(response.draft);
            setSections(response.draft.sections);
            setSavedJson(JSON.stringify(response.draft.sections));
            setErrors({});
            setNotice({ type: "success", text: "Brouillon enregistré. La page publique n'a pas changé." });
            return true;
        } catch (e) {
            const grouped = groupErrors(e.data?.errors, sections);
            setErrors(grouped);
            const firstId = Object.keys(grouped)[0];
            if (firstId) setExpandedId(firstId);
            setNotice({ type: "error", text: firstId ? "Certaines sections contiennent des erreurs." : e.message });
            return false;
        } finally {
            setBusy(null);
        }
    }

    async function publish() {
        if (!window.confirm("Publier ce brouillon ? Il remplacera la page d'accueil visible par tous.")) return;
        if ((dirty || !draft) && !(await saveDraft())) return;

        setBusy("publish");
        try {
            const response = await api.publishHomepage();
            applyState({ draft: null, published: response.published });
            setInspecting(null);
            setNotice({ type: "success", text: `${response.message} La page d'accueil publique est à jour.` });
        } catch (e) {
            setNotice({ type: "error", text: e.message || "Publication impossible." });
        } finally {
            setBusy(null);
        }
    }

    async function discard() {
        if (!window.confirm("Abandonner le brouillon et revenir à la version publiée ?")) return;
        setBusy("discard");
        try {
            if (draft) await api.discardHomepageDraft();
            applyState({ draft: null, published });
            setNotice({ type: "success", text: "Brouillon abandonné." });
        } catch (e) {
            setNotice({ type: "error", text: e.message || "Action impossible." });
        } finally {
            setBusy(null);
        }
    }

    // Ouvre le brouillon enregistré dans un nouvel onglet (enregistre d'abord si besoin).
    async function openPreviewTab() {
        const tab = window.open("about:blank", "_blank");
        if (dirty && !(await saveDraft())) {
            tab?.close();
            return;
        }
        if (tab) tab.location.href = "/apercu-page-accueil";
    }

    async function restore(version) {
        const warning = dirty || draft ? "\n\nLe brouillon en cours sera abandonné." : "";
        if (!window.confirm(`Restaurer la version ${version} ? Elle sera republiée comme nouvelle version ; l'historique est conservé.${warning}`)) return false;

        setBusy("restore");
        try {
            const response = await api.restoreHomepageVersion(version);
            applyState({ draft: null, published: response.published });
            setInspecting(null);
            setNotice({ type: "success", text: response.message });
            return true;
        } catch (e) {
            setNotice({ type: "error", text: e.message || "Restauration impossible." });
            return false;
        } finally {
            setBusy(null);
        }
    }

    const status = dirty
        ? { text: "Modifications non enregistrées", cls: "bg-amber-50 text-amber-700" }
        : draft
          ? { text: `Brouillon enregistré le ${formatDate(draft.updated_at)} — non publié`, cls: "bg-sky-50 text-sky-700" }
          : published
            ? { text: `À jour — version ${published.version} publiée le ${formatDate(published.published_at)}`, cls: "bg-emerald-50 text-emerald-700" }
            : { text: "Contenu d'origine — aucune version publiée", cls: "bg-slate-100 text-slate-600" };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'éditeur…
            </div>
        );
    }

    const previewSections = inspecting?.sections ?? sections;
    const previewLabel = inspecting ? `Version ${inspecting.version} (historique)` : "Aperçu du brouillon";

    return (
        <div>
            <Link to="/administrateur/parametres" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brass-deep">
                <ArrowLeft className="h-4 w-4" /> Paramètres
            </Link>

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-xl font-extrabold">Modifier la page d'accueil</h2>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${status.cls}`}>{status.text}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowHistory(true)} className="btn-secondary">
                        <History className="h-4 w-4" /> Historique des versions
                    </button>
                    {(dirty || draft) && (
                        <button type="button" onClick={discard} disabled={!!busy} className="btn-secondary disabled:opacity-50">
                            <Undo2 className="h-4 w-4" /> Abandonner le brouillon
                        </button>
                    )}
                    <button type="button" onClick={saveDraft} disabled={!!busy || !dirty} className="btn-secondary disabled:opacity-50">
                        {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Enregistrer le brouillon
                    </button>
                    <button type="button" onClick={openPreviewTab} disabled={!!busy} className="btn-secondary disabled:opacity-50">
                        <Eye className="h-4 w-4" /> Aperçu
                    </button>
                    <button type="button" onClick={publish} disabled={!!busy || (!dirty && !draft)} className="btn-primary disabled:opacity-50">
                        {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                        Publier
                    </button>
                </div>
            </div>

            {notice && (
                <div
                    role={notice.type === "error" ? "alert" : "status"}
                    className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                        notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                >
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Fermer le message">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Téléphone / tablette : éditeur et aperçu en onglets. */}
            <div className="mb-4 flex rounded-lg border border-slate-200 bg-surface p-0.5 lg:hidden" role="tablist">
                {[
                    ["editor", "Éditeur"],
                    ["preview", "Aperçu"],
                ].map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={mobileTab === key}
                        onClick={() => setMobileTab(key)}
                        className={`flex-1 rounded-md py-2 text-sm font-semibold ${mobileTab === key ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className={`min-w-0 ${mobileTab === "editor" ? "" : "hidden lg:block"}`}>
                    <ol className="space-y-2">
                        {sections.map((section, index) => {
                            const type = SECTION_TYPES[section.type];
                            const Icon = type.icon;
                            const expanded = expandedId === section.id;
                            const sectionErrors = errors[section.id];

                            return (
                                <li
                                    key={section.id}
                                    onDragOver={(e) => {
                                        if (dragIndex === null) return;
                                        e.preventDefault();
                                        setDropIndex(index);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (dragIndex !== null) move(dragIndex, index);
                                        setDragIndex(null);
                                        setDropIndex(null);
                                    }}
                                    className={`rounded-xl border bg-surface transition ${
                                        sectionErrors ? "border-rose-300" : dropIndex === index && dragIndex !== index ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"
                                    } ${dragIndex === index ? "opacity-50" : ""}`}
                                >
                                    <div
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.effectAllowed = "move";
                                            e.dataTransfer.setData("text/plain", section.id);
                                            setDragIndex(index);
                                        }}
                                        onDragEnd={() => {
                                            setDragIndex(null);
                                            setDropIndex(null);
                                        }}
                                        className="flex items-center gap-2 p-2.5"
                                    >
                                        <span className="cursor-grab text-slate-400 active:cursor-grabbing" title="Glisser pour déplacer" aria-hidden="true">
                                            <GripVertical className="h-5 w-5" />
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(expanded ? null : section.id)}
                                            aria-expanded={expanded}
                                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                        >
                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${section.visible ? "bg-indigo-50 text-brass" : "bg-slate-100 text-slate-400"}`}>
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className={`block truncate text-sm font-bold ${section.visible ? "text-slate-900" : "text-slate-400 line-through"}`}>
                                                    {type.label}
                                                </span>
                                                <span className="block truncate text-xs text-slate-500">
                                                    {sectionErrors ? "Contient des erreurs" : sectionSummary(section) || "—"}
                                                </span>
                                            </span>
                                            <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                        </button>
                                        <div className="flex shrink-0 items-center">
                                            <button
                                                type="button"
                                                onClick={() => updateSection(section.id, { ...section, visible: !section.visible })}
                                                className={`rounded-md p-1.5 ${section.visible ? "text-emerald-700 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}
                                                title={section.visible ? "Visible — cliquer pour masquer" : "Masquée — cliquer pour afficher"}
                                                aria-label={section.visible ? "Masquer la section" : "Afficher la section"}
                                                aria-pressed={section.visible}
                                            >
                                                {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                            </button>
                                            <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Monter" aria-label="Monter la section">
                                                <ArrowUp className="h-4 w-4" />
                                            </button>
                                            <button type="button" onClick={() => move(index, index + 1)} disabled={index === sections.length - 1} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Descendre" aria-label="Descendre la section">
                                                <ArrowDown className="h-4 w-4" />
                                            </button>
                                            <button type="button" onClick={() => removeSection(section)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50" title="Supprimer" aria-label="Supprimer la section">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {expanded && (
                                        <div className="border-t border-slate-100 p-4">
                                            <SectionEditor section={section} onChange={(next) => updateSection(section.id, next)} errors={sectionErrors} />
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    {sections.length === 0 && (
                        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                            Aucune section. Ajoutez-en une pour construire la page d'accueil.
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowAdd(true)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-bold text-slate-600 transition hover:border-indigo-400 hover:text-brass-deep"
                    >
                        <Plus className="h-4 w-4" /> Ajouter une section
                    </button>
                </div>

                <div className={`min-w-0 lg:sticky lg:top-0 lg:h-[calc(100vh-var(--app-header-height)-3rem)] ${mobileTab === "preview" ? "" : "hidden lg:block"}`}>
                    {inspecting && (
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                            <span className="font-semibold">Consultation de la version {inspecting.version}</span>
                            <span className="flex gap-2">
                                <button type="button" onClick={() => restore(inspecting.version)} disabled={!!busy} className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
                                    Restaurer cette version
                                </button>
                                <button type="button" onClick={() => setInspecting(null)} className="btn-secondary !px-3 !py-1.5 text-xs">
                                    Revenir au brouillon
                                </button>
                            </span>
                        </div>
                    )}
                    <HomepagePreviewFrame sections={previewSections} label={previewLabel} />
                </div>
            </div>

            {showAdd && <AddSectionDialog onAdd={addSection} onClose={() => setShowAdd(false)} />}
            {showHistory && (
                <HomepageVersionsDialog
                    currentVersion={published?.version}
                    busy={busy === "restore"}
                    onClose={() => setShowHistory(false)}
                    onView={(version) => {
                        setInspecting(version);
                        setShowHistory(false);
                        setMobileTab("preview");
                    }}
                    onRestore={async (version) => {
                        if (await restore(version)) setShowHistory(false);
                    }}
                />
            )}
        </div>
    );
}
