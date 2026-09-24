import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    Circle,
    Download,
    FileSpreadsheet,
    FileText,
    Image as ImageIcon,
    Loader2,
    SkipForward,
    XCircle,
} from "lucide-react";
import { api } from "../../lib/api";
import DocumentFormPage from "./DocumentFormPage";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";

/*
 * Importation de documents : Excel (données du formulaire) + PDF + couvertures facultatives.
 *
 * 1. Sélection des fichiers ; ils restent dans le navigateur.
 * 2. Vérification : le serveur lit l'Excel et valide chaque ligne avec les règles de la création
 *    manuelle ; seuls les noms / tailles des PDF et images lui sont transmis (association par nom).
 * 3. Traitement : chaque document valide est présenté, un par un, dans le formulaire habituel
 *    prérempli, puis créé en brouillon par l'endpoint de création normal. Chaque fichier n'est
 *    donc envoyé qu'une fois. Rien n'est stocké côté serveur avant la création.
 */

const PDF_MAX = 50 * 1024 * 1024;
const COVER_MAX = 5 * 1024 * 1024;

// Contrôle de la signature réelle du fichier (et pas seulement de son extension).
async function hasValidSignature(file, kind) {
    const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));

    if (kind === "pdf") {
        return new TextDecoder("latin1").decode(bytes).includes("%PDF-");
    }
    return (
        (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) || // JPEG
        (bytes[0] === 0x89 && ascii(1, 3) === "PNG") ||
        ascii(0, 4) === "GIF8" ||
        (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") ||
        ascii(0, 2) === "BM"
    );
}

function filesByName(fileList, previous = new Map()) {
    const map = new Map(previous);
    Array.from(fileList || []).forEach((file) => map.set(file.name, file));
    return map;
}

const STATUS = {
    valid: { label: "Valide", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700" },
    duplicate: { label: "Doublon", icon: AlertTriangle, cls: "bg-amber-50 text-amber-700" },
    error: { label: "Erreur", icon: XCircle, cls: "bg-rose-50 text-rose-700" },
};

function duplicateText(duplicate) {
    const by = duplicate.match === "isbn" ? "même ISBN" : "même titre et auteur";
    return duplicate.source === "base"
        ? `Doublon (${by}) du document existant « ${duplicate.document_title} ».`
        : `Doublon (${by}) de la ligne ${duplicate.line} du fichier Excel.`;
}

function FilePicker({ icon: Icon, title, hint, accept, multiple, onChange, children }) {
    return (
        <div className="rounded-xl border border-line bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <Icon className="h-4 w-4 text-brass" aria-hidden="true" />
                {title}
            </p>
            <p className="mt-1 text-xs text-ink-soft">{hint}</p>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-paper-dim/40 px-3 py-4 text-sm text-ink-soft transition-colors hover:border-brass/60">
                {multiple ? "Choisir des fichiers" : "Choisir un fichier"}
                <input
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    onChange={(e) => {
                        // Copie avant remise à zéro : e.target.files est une liste « vivante », vidée
                        // par la ligne suivante avant que React n'applique la mise à jour d'état.
                        onChange(Array.from(e.target.files || []));
                        e.target.value = ""; // permet de resélectionner les mêmes fichiers
                    }}
                    className="sr-only"
                />
            </label>
            <div className="mt-2 min-h-5 text-xs text-ink">{children}</div>
        </div>
    );
}

function Tile({ icon: Icon, value, label, cls = "text-ink" }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <Icon className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden="true" />
            <div className="min-w-0">
                <p className={`font-display text-xl font-extrabold tabular-nums ${cls}`}>{value}</p>
                <p className="text-xs text-ink-soft">{label}</p>
            </div>
        </div>
    );
}

export default function DocumentImportPage() {
    const navigate = useNavigate();
    const basePath = useLocation().pathname.startsWith("/administrateur")
        ? "/administrateur/documents"
        : "/bibliothecaire/documents";

    const [step, setStep] = useState("select"); // select | verifying | report | processing | done
    const [excel, setExcel] = useState(null);
    const [pdfs, setPdfs] = useState(() => new Map());
    const [covers, setCovers] = useState(() => new Map());
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const [report, setReport] = useState(null);
    const [filter, setFilter] = useState("all");
    const [index, setIndex] = useState(0);
    const [created, setCreated] = useState([]);
    const [skipped, setSkipped] = useState(0);
    const [flash, setFlash] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const queue = useMemo(() => report?.rows.filter((row) => row.status === "valid") || [], [report]);
    const current = queue[index];

    // Données préparées en mémoire : prévenir avant de quitter la page par erreur.
    useEffect(() => {
        if (step !== "report" && step !== "processing") return undefined;
        const warn = (event) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [step]);

    useEffect(() => {
        if (!flash) return undefined;
        const timer = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(timer);
    }, [flash]);

    async function downloadTemplate() {
        setDownloading(true);
        try {
            await api.downloadDocumentImportTemplate();
        } catch {
            setError("Le modèle Excel n'a pas pu être téléchargé.");
        } finally {
            setDownloading(false);
        }
    }

    async function verify() {
        setError(null);
        if (!excel) {
            setError("Choisissez le fichier Excel (.xlsx).");
            return;
        }
        if (!excel.name.toLowerCase().endsWith(".xlsx")) {
            setError("Le fichier doit être un classeur Excel .xlsx (le format CSV n'est pas accepté).");
            return;
        }

        setStep("verifying");
        const files = [
            ...[...pdfs.values()].map((file) => ({ file, kind: "pdf" })),
            ...[...covers.values()].map((file) => ({ file, kind: "cover" })),
        ];
        const checked = [];
        try {
            // Contrôle local des signatures par paquets, avec progression.
            for (let i = 0; i < files.length; i += 20) {
                const batch = files.slice(i, i + 20);
                const results = await Promise.all(batch.map(({ file, kind }) => hasValidSignature(file, kind).catch(() => false)));
                batch.forEach((entry, j) => checked.push({ ...entry, valid: results[j] }));
                setProgress({ label: "Contrôle des fichiers", done: checked.length, total: files.length });
            }

            setProgress({ label: "Analyse du fichier Excel" });
            const payload = new FormData();
            payload.append("excel", excel);
            let p = 0;
            let c = 0;
            checked.forEach(({ file, kind, valid }) => {
                const key = kind === "pdf" ? `pdfs[${p++}]` : `covers[${c++}]`;
                payload.append(`${key}[name]`, file.name);
                payload.append(`${key}[size]`, file.size);
                payload.append(`${key}[valid]`, valid ? 1 : 0);
            });

            const result = await api.analyzeDocumentImport(payload);
            setReport(result);
            setFilter(result.summary.errors > 0 ? "error" : "all");
            setStep("report");
        } catch (err) {
            setError(
                err.data?.errors
                    ? Object.values(err.data.errors)[0][0]
                    : err.status === 403
                      ? "Vous n'êtes pas autorisé à importer des documents."
                      : "La vérification a échoué. Réessayez.",
            );
            setStep("select");
        } finally {
            setProgress(null);
        }
    }

    // Retour à la sélection : seul le rapport est abandonné ; l'Excel, les PDF et les couvertures
    // choisis restent sélectionnés (on peut en remplacer ou en ajouter, puis revérifier).
    function backToSelection() {
        setReport(null);
        setError(null);
        setStep("select");
        document.querySelector(".connected-main")?.scrollTo({ top: 0 });
    }

    function startProcessing() {
        setIndex(0);
        setCreated([]);
        setSkipped(0);
        setStep("processing");
    }

    function next() {
        if (index + 1 >= queue.length) setStep("done");
        else setIndex(index + 1);
        document.querySelector(".connected-main")?.scrollTo({ top: 0 });
    }

    function handleCreated(doc) {
        setCreated((prev) => [...prev, doc]);
        setFlash("✓ Document créé avec succès.");
        next();
    }

    function skip() {
        setSkipped((value) => value + 1);
        next();
    }

    const summary = report?.summary;
    const visibleRows = (report?.rows || []).filter((row) => filter === "all" || row.status === filter);

    return (
        <div className="mx-auto w-full max-w-5xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                        <FileSpreadsheet className="h-5 w-5 text-brass" aria-hidden="true" />
                        Importer des documents
                    </h2>
                    <p className="mt-1 text-sm text-ink-soft">
                        Excel + PDF + couvertures, associés par nom de fichier. Chaque document est vérifié puis créé en brouillon.
                    </p>
                </div>
                {step === "select" && (
                    <Link to={`${basePath}/nouveau`} className="btn-secondary">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Ajout manuel
                    </Link>
                )}
                {step === "report" && (
                    <button
                        type="button"
                        onClick={backToSelection}
                        className="btn-secondary"
                        title="Revenir à la sélection : l'Excel, les PDF et les couvertures choisis sont conservés"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Retour à la sélection
                    </button>
                )}
            </div>

            {error && (
                <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
                    {error}
                </p>
            )}

            {/* 1. Sélection */}
            {step === "select" && (
                <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <FilePicker
                            icon={FileSpreadsheet}
                            title="Fichier Excel *"
                            hint="Classeur .xlsx rempli à partir du modèle (CSV non accepté)."
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={(files) => setExcel(files[0] || null)}
                        >
                            {excel ? `✓ ${excel.name}` : <span className="text-ink-soft">Aucun fichier choisi</span>}
                        </FilePicker>
                        <FilePicker
                            icon={FileText}
                            title="Fichiers PDF *"
                            hint="Sélection multiple possible, en une ou plusieurs fois."
                            accept="application/pdf,.pdf"
                            multiple
                            onChange={(files) => setPdfs((prev) => filesByName(files, prev))}
                        >
                            {pdfs.size > 0 ? (
                                <span className="flex items-center justify-between gap-2">
                                    ✓ {pdfs.size} PDF sélectionné{pdfs.size > 1 ? "s" : ""}
                                    <button type="button" onClick={() => setPdfs(new Map())} className="text-ink-soft underline hover:text-ink">
                                        Vider
                                    </button>
                                </span>
                            ) : (
                                <span className="text-ink-soft">Aucun PDF choisi</span>
                            )}
                        </FilePicker>
                        <FilePicker
                            icon={ImageIcon}
                            title="Photos de couverture"
                            hint="Facultatif. JPG, PNG, GIF, WEBP ou BMP, 5 Mo max."
                            accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                            multiple
                            onChange={(files) => setCovers((prev) => filesByName(files, prev))}
                        >
                            {covers.size > 0 ? (
                                <span className="flex items-center justify-between gap-2">
                                    ✓ {covers.size} image{covers.size > 1 ? "s" : ""} sélectionnée{covers.size > 1 ? "s" : ""}
                                    <button type="button" onClick={() => setCovers(new Map())} className="text-ink-soft underline hover:text-ink">
                                        Vider
                                    </button>
                                </span>
                            ) : (
                                <span className="text-ink-soft">Aucune image (facultatif)</span>
                            )}
                        </FilePicker>
                    </div>

                    <p className="text-xs text-ink-soft">
                        Les colonnes « Nom du fichier PDF » et « Nom de la couverture » de l'Excel doivent correspondre exactement aux noms
                        des fichiers choisis (l'ordre de sélection n'a aucune importance). Un PDF de plus de {PDF_MAX / 1024 / 1024} Mo ou une
                        image de plus de {COVER_MAX / 1024 / 1024} Mo est refusé.
                    </p>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <button type="button" onClick={downloadTemplate} disabled={downloading} className="btn-secondary disabled:opacity-50">
                            {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                            Télécharger le modèle Excel
                        </button>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={() => navigate(`${basePath}/nouveau`)} className="btn-secondary">
                                Annuler
                            </button>
                            <button type="button" onClick={verify} disabled={!excel} className="btn-primary disabled:opacity-50">
                                Vérifier les fichiers
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Vérification en cours */}
            {step === "verifying" && (
                <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-10 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-brass" aria-hidden="true" />
                    <p className="font-semibold text-ink">{progress?.label || "Vérification"}…</p>
                    {progress?.total > 0 && (
                        <>
                            <p className="tabular-nums text-sm text-ink-soft">
                                {progress.done} / {progress.total}
                            </p>
                            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* 3. Rapport de vérification */}
            {step === "report" && summary && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-line bg-paper p-4">
                        <p className="font-display text-lg font-extrabold text-ink">Importation vérifiée</p>
                        <p className="text-sm text-ink-soft">
                            {summary.total} document{summary.total > 1 ? "s" : ""} détecté{summary.total > 1 ? "s" : ""}
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <Tile icon={CheckCircle2} value={summary.valid} label="documents prêts" cls="text-emerald-700" />
                            <Tile icon={AlertTriangle} value={summary.duplicates} label="doublons" cls="text-amber-700" />
                            <Tile icon={XCircle} value={summary.errors} label="erreurs" cls="text-rose-700" />
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-ink sm:grid-cols-2">
                            <p className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-ink-soft" aria-hidden="true" />
                                PDF : <strong className="tabular-nums">{summary.pdf_found} / {summary.total}</strong> trouvés
                            </p>
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <ImageIcon className="h-4 w-4 text-ink-soft" aria-hidden="true" />
                                Couvertures : <strong className="tabular-nums">{summary.covers_found}</strong> trouvée{summary.covers_found > 1 ? "s" : ""}
                                <span className="inline-flex items-center gap-1 text-ink-soft">
                                    <Circle className="h-3 w-3" aria-hidden="true" /> {summary.without_cover} sans couverture
                                </span>
                            </p>
                        </div>
                        {report.ignored_columns?.length > 0 && (
                            <p className="mt-3 text-xs text-ink-soft">
                                Colonnes ignorées (non reconnues) : {report.ignored_columns.join(", ")}.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les lignes">
                        {[
                            ["all", `Toutes (${summary.total})`],
                            ["valid", `Valides (${summary.valid})`],
                            ["duplicate", `Doublons (${summary.duplicates})`],
                            ["error", `Erreurs (${summary.errors})`],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={filter === value}
                                onClick={() => setFilter(value)}
                                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                                    filter === value ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-brass"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                        {visibleRows.length === 0 && <li className="p-6 text-center text-sm text-ink-soft">Aucune ligne dans cette catégorie.</li>}
                        {visibleRows.map((row) => {
                            const status = STATUS[row.status];
                            return (
                                <li key={row.line} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                                    <span className="w-16 shrink-0 text-xs font-semibold text-ink-soft">Ligne {row.line}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-ink [overflow-wrap:anywhere]">{row.form.title || <em className="text-ink-soft">Sans titre</em>}</p>
                                        <p className="mt-0.5 text-xs text-ink-soft [overflow-wrap:anywhere]">
                                            {[row.library_name, row.author_names.join(", "), row.form.type].filter(Boolean).join(" · ")}
                                        </p>
                                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                                            <span className={row.pdf_error || !row.pdf ? "text-rose-700" : "text-ink-soft"}>
                                                PDF : {row.pdf || "—"}
                                            </span>
                                            <span className={row.cover_error ? "text-rose-700" : "text-ink-soft"}>
                                                Couverture : {row.cover || "aucune"}
                                            </span>
                                        </p>
                                        {row.errors.length > 0 && (
                                            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-rose-700">
                                                {row.errors.map((message) => <li key={message}>{message}</li>)}
                                            </ul>
                                        )}
                                        {row.duplicate && <p className="mt-1.5 text-xs text-amber-700">{duplicateText(row.duplicate)}</p>}
                                        {(row.notes.length > 0 || row.new_authors.length > 0) && (
                                            <p className="mt-1 text-xs text-ink-soft">
                                                {[...row.notes, ...(row.new_authors.length ? [`Nouveaux auteurs : ${row.new_authors.join(", ")}.`] : [])].join(" ")}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>
                                        <status.icon className="h-3.5 w-3.5" aria-hidden="true" />
                                        {status.label}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <button type="button" onClick={() => setConfirmCancel(true)} className="btn-secondary">
                            Annuler l'importation
                        </button>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            {(summary.errors > 0 || summary.duplicates > 0) && (
                                <button
                                    type="button"
                                    onClick={backToSelection}
                                    className="btn-secondary"
                                    title="Revenir à la sélection pour corriger l'Excel ou ajouter les fichiers manquants"
                                >
                                    Corriger les erreurs
                                </button>
                            )}
                            <button type="button" onClick={startProcessing} disabled={summary.valid === 0} className="btn-primary disabled:opacity-50">
                                Traiter les documents valides ({summary.valid})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. Création un par un, avec le formulaire habituel prérempli */}
            {step === "processing" && current && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-line bg-surface p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-display text-lg font-extrabold tabular-nums text-ink">
                                Document {index + 1} / {queue.length}
                                <span className="ml-2 text-xs font-medium text-ink-soft">(ligne {current.line} de l'Excel)</span>
                            </p>
                            <div className="flex gap-2">
                                <button type="button" onClick={skip} className="btn-secondary !py-1.5 text-sm" title="Ne pas créer ce document et passer au suivant">
                                    <SkipForward className="h-4 w-4" aria-hidden="true" />
                                    Passer
                                </button>
                                <button type="button" onClick={() => setConfirmCancel(true)} className="btn-secondary !py-1.5 text-sm">
                                    Annuler
                                </button>
                            </div>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
                        </div>
                        {flash && (
                            <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">
                                {flash}
                            </p>
                        )}
                    </div>
                    <DocumentFormPage
                        key={current.line}
                        importItem={{
                            form: current.form,
                            file: pdfs.get(current.matched_pdf) || null,
                            cover: current.matched_cover ? covers.get(current.matched_cover) || null : null,
                            newAuthors: current.new_authors,
                        }}
                        onImported={handleCreated}
                    />
                </div>
            )}

            {/* 5. Fin du lot */}
            {step === "done" && summary && (
                <div className="rounded-xl border border-line bg-surface p-6 text-center">
                    <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-700" aria-hidden="true" />
                    <p className="mt-2 font-display text-xl font-extrabold text-ink">Importation terminée</p>
                    <dl className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5 text-left text-sm">
                        <dt className="text-ink-soft">Documents créés</dt>
                        <dd className="text-right font-bold tabular-nums text-ink">{created.length}</dd>
                        {skipped > 0 && (
                            <>
                                <dt className="text-ink-soft">Documents passés</dt>
                                <dd className="text-right font-bold tabular-nums text-ink">{skipped}</dd>
                            </>
                        )}
                        <dt className="text-ink-soft">Doublons</dt>
                        <dd className="text-right font-bold tabular-nums text-ink">{summary.duplicates}</dd>
                        <dt className="text-ink-soft">Erreurs</dt>
                        <dd className="text-right font-bold tabular-nums text-ink">{summary.errors}</dd>
                        <dt className="text-ink-soft">Documents sans couverture</dt>
                        <dd className="text-right font-bold tabular-nums text-ink">{created.filter((doc) => !doc.cover_path).length}</dd>
                    </dl>
                    <p className="mt-4 text-xs text-ink-soft">Les documents créés sont en brouillon : publiez-les depuis la liste des documents.</p>
                    <button type="button" onClick={() => navigate(basePath)} className="btn-primary mt-5">
                        Terminer
                    </button>
                </div>
            )}

            <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
                <DialogContent onClose={() => setConfirmCancel(false)}>
                    <DialogHeader>
                        <DialogTitle>Annuler l'importation ?</DialogTitle>
                        <DialogDescription>
                            Les lignes préparées non encore créées seront abandonnées. Les documents déjà créés
                            {created.length > 0 ? ` (${created.length})` : ""} sont conservés en brouillon.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button type="button" onClick={() => setConfirmCancel(false)} className="btn-secondary">
                            Continuer l'importation
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(created.length > 0 ? basePath : `${basePath}/nouveau`)}
                            className="btn-primary"
                        >
                            Annuler l'importation
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
