import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Eye, Loader2, Monitor, Moon, Palette, RotateCcw, Rocket, Save, Smartphone, Sun, Tablet, Undo2, X } from "lucide-react";
import { api } from "../../lib/api";
import {
    THEME_KEYS,
    THEME_MODES,
    THEME_PREVIEW_MESSAGE,
    THEME_PREVIEW_READY,
    THEME_PREVIEW_STORAGE,
    contrastWarnings,
    isHex,
} from "../../lib/theme";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const DEVICES = {
    desktop: { width: 1280, label: "Ordinateur", icon: Monitor },
    tablet: { width: 768, label: "Tablette", icon: Tablet },
    mobile: { width: 390, label: "Mobile", icon: Smartphone },
};

const formatDate = (value) =>
    value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Une couleur : sélecteur visuel + saisie HEX validée. */
function ColorField({ id, label, hint, value, defaultValue, onChange }) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const invalid = !isHex(text);

    return (
        <div className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <label htmlFor={id} className="text-sm font-semibold text-ink">
                    {label}
                </label>
                <p className="text-xs text-ink-soft">{hint}</p>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={`${label} — sélecteur`}
                    value={isHex(value) ? value : "#000000"}
                    onChange={(e) => onChange(e.target.value.toLowerCase())}
                    className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-0.5"
                />
                <div>
                    <input
                        id={id}
                        value={text}
                        maxLength={7}
                        spellCheck={false}
                        aria-invalid={invalid}
                        onChange={(e) => {
                            const next = e.target.value.trim();
                            setText(next);
                            if (isHex(next)) onChange(next.toLowerCase());
                        }}
                        className={`w-24 rounded-md border px-2 py-1.5 font-mono text-sm uppercase ${invalid ? "!border-rose-500" : "border-line"}`}
                    />
                    {invalid && <p className="mt-0.5 text-[11px] text-rose-700">Format #RRGGBB</p>}
                </div>
                <button
                    type="button"
                    onClick={() => onChange(defaultValue)}
                    disabled={value === defaultValue}
                    title={`Couleur d'origine : ${defaultValue.toUpperCase()}`}
                    aria-label={`Rétablir la couleur d'origine de « ${label} »`}
                    className="rounded-md p-1.5 text-ink-soft hover:bg-slate-100 hover:text-ink disabled:opacity-30"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

/** Aperçu en direct : /apercu-theme dans un iframe, à la taille d'un ordinateur, d'une tablette ou d'un mobile. */
function ThemePreviewFrame({ css, mode, onModeChange }) {
    const boxRef = useRef(null);
    const frameRef = useRef(null);
    const [device, setDevice] = useState("desktop");
    const [box, setBox] = useState({ width: 0, height: 0 });
    const [ready, setReady] = useState(0);

    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(boxRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        function onMessage(event) {
            if (event.origin === window.location.origin && event.source === frameRef.current?.contentWindow && event.data?.type === THEME_PREVIEW_READY) {
                setReady((value) => value + 1);
            }
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    useEffect(() => {
        if (!ready || css === null) return;
        frameRef.current?.contentWindow?.postMessage({ type: THEME_PREVIEW_MESSAGE, css, mode }, window.location.origin);
    }, [css, mode, ready]);

    const width = DEVICES[device].width;
    const scale = box.width ? Math.min(1, box.width / width) : 1;
    const offset = Math.max(0, (box.width - width * scale) / 2);

    return (
        <div className="flex h-full flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-lg border border-slate-200 bg-surface p-0.5" role="group" aria-label="Mode de l'aperçu">
                    {[["light", "Clair", Sun], ["dark", "Sombre", Moon]].map(([value, label, Icon]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onModeChange(value)}
                            aria-pressed={mode === value}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${mode === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                        </button>
                    ))}
                </div>
                <div className="flex rounded-lg border border-slate-200 bg-surface p-0.5" role="group" aria-label="Taille d'écran de l'aperçu">
                    {Object.entries(DEVICES).map(([key, { label, icon: Icon }]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setDevice(key)}
                            aria-pressed={device === key}
                            title={label}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${device === key ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">{label}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div ref={boxRef} className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <iframe
                    ref={frameRef}
                    src="/apercu-theme"
                    title="Aperçu du thème"
                    className="absolute left-0 top-0 border-0 bg-surface"
                    style={{ width, height: box.height / scale || "100%", transform: `translateX(${offset}px) scale(${scale})`, transformOrigin: "top left" }}
                />
            </div>
        </div>
    );
}

export default function AdminThemeEditorPage() {
    const [loading, setLoading] = useState(true);
    const [defaults, setDefaults] = useState(null);
    const [draft, setDraft] = useState(null);
    const [published, setPublished] = useState(null);
    const [colors, setColors] = useState(null);
    const [previewCss, setPreviewCss] = useState(null);
    const [previewMode, setPreviewMode] = useState("light");
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);
    const [confirm, setConfirm] = useState(null); // "publish" | "restore"
    const [mobileTab, setMobileTab] = useState("editor");

    useEffect(() => {
        api.getThemeSettings()
            .then((data) => {
                setDefaults(data.defaults);
                setDraft(data.draft);
                setPublished(data.published);
                setColors(data.draft?.colors || data.published?.colors || data.defaults);
            })
            .catch(() => setNotice({ type: "error", text: "Impossible de charger l'apparence du site." }))
            .finally(() => setLoading(false));
    }, []);

    const saved = draft?.colors || published?.colors || defaults;
    const dirty = colors && saved ? !same(colors, saved) : false;
    const valid = colors ? THEME_MODES.every(({ mode }) => THEME_KEYS.every(({ key }) => isHex(colors[mode][key]))) : false;
    const warnings = useMemo(
        () => (colors ? Object.fromEntries(THEME_MODES.map(({ mode }) => [mode, contrastWarnings(colors[mode])])) : {}),
        [colors],
    );

    // Aperçu : CSS calculé et validé par le serveur (aucune écriture), après une courte pause de saisie.
    useEffect(() => {
        if (!colors || !valid) return undefined;
        const timer = setTimeout(() => {
            api.previewTheme(colors).then(({ css }) => setPreviewCss(css)).catch(() => {});
        }, 200);
        return () => clearTimeout(timer);
    }, [colors, valid]);

    // Quitter avec des modifications non enregistrées.
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (event) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const setColor = useCallback((mode, key, value) => {
        setColors((prev) => ({ ...prev, [mode]: { ...prev[mode], [key]: value } }));
    }, []);

    // Le thème actif est appliqué tout de suite à la page de l'administrateur (les autres pages
    // le reçoivent au prochain chargement, via app.blade.php).
    async function applyToCurrentPage(activeColors) {
        const { css } = await api.previewTheme(activeColors);
        let style = document.getElementById("site-theme");
        if (!style) {
            style = document.createElement("style");
            style.id = "site-theme";
            document.head.appendChild(style);
        }
        style.textContent = css;
    }

    async function saveDraft() {
        setBusy("save");
        setNotice(null);
        try {
            const response = await api.saveThemeDraft(colors);
            setDraft(response.draft);
            setNotice({ type: "success", text: response.message });
            return true;
        } catch (e) {
            setNotice({ type: "error", text: e.data?.errors ? Object.values(e.data.errors)[0][0] : e.message || "Enregistrement impossible." });
            return false;
        } finally {
            setBusy(null);
        }
    }

    async function publish() {
        setConfirm(null);
        if (dirty && !(await saveDraft())) return; // publier = enregistrer le brouillon puis le publier
        setBusy("publish");
        try {
            const response = await api.publishTheme();
            setPublished(response.published);
            setDraft(null);
            setColors(response.published.colors);
            await applyToCurrentPage(response.published.colors);
            setNotice({ type: "success", text: `${response.message} Il s'applique maintenant à tout le site.` });
        } catch (e) {
            setNotice({ type: "error", text: e.message || "Publication impossible." });
        } finally {
            setBusy(null);
        }
    }

    async function restoreDefault() {
        setConfirm(null);
        setBusy("restore");
        setNotice(null);
        try {
            const response = await api.restoreDefaultTheme();
            setPublished(response.published);
            setDraft(null);
            setColors(response.published.colors);
            await applyToCurrentPage(response.published.colors);
            setNotice({ type: "success", text: response.message });
        } catch (e) {
            setNotice({ type: "error", text: e.message || "Restauration impossible." });
        } finally {
            setBusy(null);
        }
    }

    async function discard() {
        setBusy("discard");
        try {
            if (draft) await api.discardThemeDraft();
            setDraft(null);
            setColors(published?.colors || defaults);
            setNotice({ type: "success", text: "Modifications abandonnées." });
        } catch (e) {
            setNotice({ type: "error", text: e.message || "Action impossible." });
        } finally {
            setBusy(null);
        }
    }

    function openPreviewTab() {
        try {
            localStorage.setItem(THEME_PREVIEW_STORAGE, JSON.stringify({ colors, mode: previewMode }));
        } catch {
            /* l'aperçu intégré reste disponible */
        }
        window.open("/apercu-theme", "_blank", "noopener");
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'apparence du site…
            </div>
        );
    }
    if (!colors) {
        return notice && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{notice.text}</p>;
    }

    const status = dirty
        ? { text: "Modifications non enregistrées", cls: "bg-amber-50 text-amber-700" }
        : draft
          ? { text: `Brouillon enregistré le ${formatDate(draft.updated_at)} — non publié`, cls: "bg-sky-50 text-sky-700" }
          : published && !published.is_default
            ? { text: `Thème personnalisé — version ${published.version} publiée le ${formatDate(published.published_at)}`, cls: "bg-emerald-50 text-emerald-700" }
            : { text: "Couleurs d'origine du site", cls: "bg-slate-100 text-slate-600" };

    return (
        <div>
            <Link to="/administrateur/parametres" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brass-deep">
                <ArrowLeft className="h-4 w-4" /> Paramètres
            </Link>

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
                        <Palette className="h-5 w-5 text-brass" aria-hidden="true" /> Apparence du site
                    </h2>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${status.cls}`}>{status.text}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(dirty || draft) && (
                        <button type="button" onClick={discard} disabled={!!busy} className="btn-secondary disabled:opacity-50">
                            <Undo2 className="h-4 w-4" /> Abandonner le brouillon
                        </button>
                    )}
                    <button type="button" onClick={saveDraft} disabled={!!busy || !dirty || !valid} className="btn-secondary disabled:opacity-50">
                        {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Enregistrer le brouillon
                    </button>
                    <button type="button" onClick={openPreviewTab} disabled={!valid} className="btn-secondary disabled:opacity-50">
                        <Eye className="h-4 w-4" /> Aperçu
                    </button>
                    <button type="button" onClick={() => setConfirm("publish")} disabled={!!busy || !valid || (!dirty && !draft)} className="btn-primary disabled:opacity-50">
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

            {/* Téléphone / tablette : couleurs et aperçu en onglets. */}
            <div className="mb-4 flex rounded-lg border border-slate-200 bg-surface p-0.5 lg:hidden" role="tablist">
                {[["editor", "Couleurs"], ["preview", "Aperçu"]].map(([key, label]) => (
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
                <div className={`min-w-0 space-y-4 ${mobileTab === "editor" ? "" : "hidden lg:block"}`}>
                    {THEME_MODES.map(({ mode, label }) => (
                        <section key={mode} className="rounded-xl border border-line bg-surface p-4" aria-labelledby={`theme-${mode}`}>
                            <h3 id={`theme-${mode}`} className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em] text-brass">
                                {mode === "light" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                                {label}
                            </h3>
                            <div className="mt-2">
                                {THEME_KEYS.map(({ key, label: keyLabel, hint }) => (
                                    <ColorField
                                        key={key}
                                        id={`theme-${mode}-${key}`}
                                        label={keyLabel}
                                        hint={hint}
                                        value={colors[mode][key]}
                                        defaultValue={defaults[mode][key]}
                                        onChange={(value) => setColor(mode, key, value)}
                                    />
                                ))}
                            </div>
                            {warnings[mode]?.length > 0 && (
                                <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                                    <p className="flex items-center gap-1.5 font-bold">
                                        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Contraste insuffisant (recommandé : 4,5:1 minimum)
                                    </p>
                                    <ul className="mt-1 list-disc pl-5">
                                        {warnings[mode].map(({ label: warning, ratio }) => (
                                            <li key={warning}>
                                                {warning} : {ratio.toFixed(2).replace(".", ",")}:1
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>
                    ))}

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <p className="text-sm font-semibold text-ink">Thème par défaut</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                            Rétablit les couleurs d'origine du site dans une nouvelle version publiée. L'historique des versions est conservé.
                        </p>
                        <button type="button" onClick={() => setConfirm("restore")} disabled={!!busy} className="btn-secondary mt-3 disabled:opacity-50">
                            {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            Restaurer le thème par défaut
                        </button>
                    </div>
                </div>

                <div className={`min-w-0 lg:sticky lg:top-4 lg:self-start ${mobileTab === "preview" ? "" : "hidden lg:block"}`}>
                    <ThemePreviewFrame css={previewCss} mode={previewMode} onModeChange={setPreviewMode} />
                </div>
            </div>

            <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <DialogContent onClose={() => setConfirm(null)}>
                    <DialogHeader>
                        <DialogTitle>{confirm === "restore" ? "Restaurer le thème par défaut ?" : "Publier ce thème ?"}</DialogTitle>
                        <DialogDescription>
                            {confirm === "restore"
                                ? "Les couleurs d'origine s'appliqueront à tout le site (modes clair et sombre). Le brouillon en cours sera abandonné ; les versions précédentes restent dans l'historique."
                                : "Les couleurs du brouillon deviendront le thème de tout le site, pour tous les utilisateurs, en mode clair comme en mode sombre."}
                        </DialogDescription>
                    </DialogHeader>
                    {confirm === "publish" && (warnings.light?.length > 0 || warnings.dark?.length > 0) && (
                        <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-semibold text-amber-700">
                            Attention : certains contrastes sont insuffisants, des textes pourraient être difficiles à lire.
                        </p>
                    )}
                    <DialogFooter>
                        <button type="button" onClick={() => setConfirm(null)} className="btn-secondary">
                            Annuler
                        </button>
                        <button type="button" onClick={confirm === "restore" ? restoreDefault : publish} className="btn-primary">
                            {confirm === "restore" ? "Restaurer" : "Publier"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
