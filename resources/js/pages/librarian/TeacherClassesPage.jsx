import { useEffect, useState } from "react";
import { Check, GraduationCap, Inbox, Pencil, Search, X } from "lucide-react";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/search";
import Pager from "../../components/Pager";
import { useToast } from "../../components/Toast";
import { useConfirm } from "../../components/ConfirmDialog";
import { ViewButton } from "../../components/DetailModal";
import ProfileDetailModal from "../../components/ProfileDetailModal";
import { formatDateTime, userSections } from "../../lib/detailSections";
import { usePageRefresh } from "../../context/RefreshContext";

const key = (school, level) => `${school}|${level}`;

// Grille établissements × niveaux : les cases cochées sont les classes de l'enseignant.
function ClassesModal({ teacher, schools, levels, onCancel, onSaved }) {
    const [checked, setChecked] = useState(() => new Set(teacher.teacher_classes.map((c) => key(c.school, c.level))));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    function toggle(k) {
        setChecked((current) => {
            const next = new Set(current);
            next.has(k) ? next.delete(k) : next.add(k);
            return next;
        });
    }

    async function save() {
        setSaving(true);
        setError(null);
        try {
            const classes = [...checked].map((k) => {
                const [school, level] = k.split("|");
                return { school, level };
            });
            onSaved(await api.updateTeacherClasses(teacher.id, classes));
        } catch (e) {
            setError(e?.data?.message || "Enregistrement impossible. Réessayez.");
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal="true" aria-labelledby="classes-title">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-surface">
                <div className="flex items-start justify-between gap-3 border-b border-line p-5">
                    <div>
                        <h2 id="classes-title" className="font-display text-lg font-extrabold">Classes de {teacher.name}</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            Cochez les classes où cet enseignant enseigne. Il ne pourra adresser ses bibliographies de cours qu’à ces classes.
                        </p>
                    </div>
                    <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="overflow-auto p-5">
                    <table className="w-full min-w-[520px] text-sm">
                        <thead>
                            <tr>
                                <th className="py-2 pr-3 text-left">Établissement</th>
                                {levels.map((level) => <th key={level} className="px-2 py-2 text-center">{level}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {schools.map((school) => (
                                <tr key={school} className="border-t border-line">
                                    <td className="py-2 pr-3 font-semibold">{school}</td>
                                    {levels.map((level) => {
                                        const k = key(school, level);
                                        return (
                                            <td key={level} className="px-2 py-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={checked.has(k)}
                                                    onChange={() => toggle(k)}
                                                    aria-label={`${school} · ${level}`}
                                                    className="h-4 w-4 accent-indigo-600"
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {error && <p role="alert" className="mx-5 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}
                <div className="flex items-center justify-between gap-3 border-t border-line p-5">
                    <span className="text-sm text-slate-600">{checked.size} classe{checked.size > 1 ? "s" : ""} cochée{checked.size > 1 ? "s" : ""}</span>
                    <div className="flex gap-3">
                        <button type="button" onClick={onCancel} className="btn-secondary">Annuler</button>
                        <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                            {saving ? "Enregistrement…" : "Enregistrer"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Demandes de classe envoyées par les enseignants : validation (classe attribuée) ou refus avec motif.
function PendingRequests({ requests, onProcessed }) {
    const confirm = useConfirm();
    const toast = useToast();
    const [busy, setBusy] = useState(null);
    const [viewing, setViewing] = useState(null);

    async function run(r, approve) {
        let reason = null;
        if (!approve) {
            reason = await confirm({
                title: `Refuser la demande de ${r.user?.name} (${r.school} · ${r.level}) ?`,
                reasonLabel: "Motif du refus (envoyé à l’enseignant)",
                danger: true,
            });
            if (!reason) return;
        }
        setBusy(r.id);
        try {
            if (approve) await api.approveClassRequest(r.id);
            else await api.rejectClassRequest(r.id, reason);
            toast(approve ? `${r.school} · ${r.level} attribuée à ${r.user?.name}.` : "Demande refusée, l’enseignant est prévenu.");
            onProcessed();
        } catch (e) {
            toast(e?.data?.message || "Action impossible.");
        } finally {
            setBusy(null);
        }
    }

    if (!requests.length) return null;

    return (
        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="pending-title">
            <h3 id="pending-title" className="flex items-center gap-2 font-bold text-amber-700">
                <Inbox className="h-4 w-4" /> {requests.length} demande{requests.length > 1 ? "s" : ""} de classe à traiter
            </h3>
            <ul className="mt-3 space-y-2">
                {requests.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm">
                                <b>{r.user?.name}</b> demande <b className="text-brass-deep">{r.school} · {r.level}</b>
                            </p>
                            <p className="break-words text-xs text-slate-500">
                                {[r.user?.email, r.user?.faculty, r.user?.teaching_specialty].filter(Boolean).join(" · ")} · le {new Date(r.created_at).toLocaleDateString("fr-FR")}
                            </p>
                            {r.message && <p className="mt-1 text-sm text-slate-600">« {r.message} »</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <ViewButton onClick={() => setViewing(r)} label="Voir la demande" />
                            <button type="button" onClick={() => run(r, true)} disabled={busy === r.id} className="btn-primary !py-1.5 disabled:opacity-50">
                                <Check className="h-4 w-4" /> Valider
                            </button>
                            <button type="button" onClick={() => run(r, false)} disabled={busy === r.id} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                                <X className="h-4 w-4" /> Refuser
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            {viewing && (
                <ProfileDetailModal
                    title={viewing.user?.name}
                    subtitle={viewing.user?.email}
                    photoUrl={viewing.user?.photo_url}
                    badges={[{ label: "Enseignant" }, { label: "Demande en attente", tone: "warning" }]}
                    highlights={[
                        ["Classe demandée", `${viewing.school} · ${viewing.level}`],
                        ["Demandée le", formatDateTime(viewing.created_at)],
                        ["Classes actuelles", viewing.user?.teacher_classes?.length ? `${viewing.user.teacher_classes.length}` : "Aucune"],
                    ]}
                    sections={[
                        {
                            title: "Demande",
                            fields: [
                                ["Message de l’enseignant", viewing.message || "Aucun message"],
                                ["Classes déjà attribuées", (viewing.user?.teacher_classes || []).map((c) => `${c.school} · ${c.level}`).join(", ") || "Aucune"],
                            ],
                        },
                        ...userSections(viewing.user || {}),
                    ]}
                    actions={(
                        <>
                            <button type="button" onClick={() => { const r = viewing; setViewing(null); run(r, false); }} disabled={busy === viewing.id} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                                <X className="h-4 w-4" /> Refuser
                            </button>
                            <button type="button" onClick={() => { const r = viewing; setViewing(null); run(r, true); }} disabled={busy === viewing.id} className="btn-primary disabled:opacity-50">
                                <Check className="h-4 w-4" /> Valider
                            </button>
                        </>
                    )}
                    onClose={() => setViewing(null)}
                />
            )}
        </section>
    );
}

// Service Numérique / administrateur : classes attribuées à chaque enseignant.
export default function TeacherClassesPage() {
    const toast = useToast();
    const [pending, setPending] = useState([]);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const search = useDebouncedValue(query.trim(), 300);
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);

    const fetchPage = () => api.getTeachers({ page, ...(search ? { search } : {}) });

    useEffect(() => setPage(1), [search]);
    useEffect(() => {
        let active = true;
        fetchPage()
            .then((r) => active && (setResult(r), setError(null)))
            .catch(() => active && setError("Impossible de charger les enseignants."));
        return () => { active = false; };
    }, [page, search]);
    const loadPending = () => api.getPendingClassRequests().then(setPending);
    useEffect(() => { loadPending().catch(() => {}); }, []);
    usePageRefresh(() => Promise.all([fetchPage().then((r) => { setResult(r); setError(null); }), loadPending()]));

    // Demande traitée : la liste des demandes et les classes affichées sont rechargées.
    function processed() {
        loadPending().catch(() => {});
        fetchPage().then(setResult).catch(() => {});
    }

    function saved(classes) {
        setResult((r) => ({ ...r, data: r.data.map((t) => (t.id === editing.id ? { ...t, teacher_classes: classes } : t)) }));
        toast(`Classes de ${editing.name} enregistrées.`);
        setEditing(null);
    }

    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-brass" />
                <h2 className="font-display text-xl font-extrabold">Enseignants et classes</h2>
            </div>
            <p className="mb-5 max-w-3xl text-sm text-slate-600">
                Attribuez à chaque enseignant les classes (établissement et niveau) où il enseigne. Ses bibliographies de cours
                ne peuvent être adressées qu’à ces classes, et seuls les étudiants dont le profil correspond les reçoivent.
            </p>

            <div className="relative mb-5 max-w-[600px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher un enseignant (nom, e-mail, faculté, spécialité)…"
                    aria-label="Rechercher un enseignant"
                    className="w-full rounded-xl border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm"
                />
            </div>

            <PendingRequests requests={pending} onProcessed={processed} />

            {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            {result === null ? (
                <p className="text-sm text-slate-500">Chargement…</p>
            ) : result.data.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">
                    {search ? "Aucun enseignant trouvé." : "Aucun compte enseignant pour le moment."}
                </div>
            ) : (
                <div className="space-y-3">
                    {result.data.map((t) => (
                        <div key={t.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="font-semibold">{t.name}{!t.is_active && <span className="ml-2 text-xs font-medium text-slate-500">(désactivé)</span>}</p>
                                <p className="break-words text-xs text-slate-500">
                                    {[t.email, t.faculty, t.teaching_specialty].filter(Boolean).join(" · ")}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {t.teacher_classes.length ? (
                                        t.teacher_classes.map((c) => (
                                            <span key={c.id || key(c.school, c.level)} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-brass-deep">
                                                {c.school} · {c.level}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs font-medium text-amber-700">Aucune classe attribuée</span>
                                    )}
                                </div>
                            </div>
                            <button type="button" onClick={() => setEditing(t)} className="btn-secondary shrink-0">
                                <Pencil className="h-4 w-4" /> Modifier les classes
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <Pager meta={result} onChange={setPage} />

            {editing && (
                <ClassesModal
                    teacher={editing}
                    schools={result.schools}
                    levels={result.levels}
                    onCancel={() => setEditing(null)}
                    onSaved={saved}
                />
            )}
        </div>
    );
}
