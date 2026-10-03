import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    X,
    Mail,
    User,
    Phone,
    GraduationCap,
    BookOpen,
    BadgeCheck,
    Ticket,
    FileText,
    Building2,
} from "lucide-react";

// Fiche « Voir » d'une personne (utilisateur, bibliothécaire, demande de compte) ou d'une bibliothèque, présentée comme une page de profil :
// bandeau, avatar, badges, informations clés en tuiles, puis les sections en cartes.
// `sections` = [{ title, fields: [[libellé, valeur], …] }] (mêmes données que DetailModal) ;
// les champs vides et ceux déjà affichés dans `highlights` sont masqués.

const SECTION_ICONS = {
    "Identité": User,
    "Contact": Phone,
    "Profil étudiant": GraduationCap,
    "Profil enseignant / chercheur": BookOpen,
    "Compte": BadgeCheck,
    "Demande": Ticket,
    "Informations": Building2,
};

const BADGE_TONES = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    brand: "bg-indigo-50 text-brass-deep ring-indigo-200",
};

const isEmpty = (value) => value === null || value === undefined || value === "" || value === false;

function initials(name = "") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default function ProfileDetailModal({
    title,
    subtitle,
    photoUrl, // photo de profil (ou de couverture d'une bibliothèque) affichée dans l'avatar
    coverUrl, // photo de couverture : remplace le bandeau dégradé
    avatarIcon: AvatarIcon, // icône de l'avatar à la place des initiales (ex. bibliothèque)
    subtitleIcon: SubtitleIcon = Mail,
    badges = [], // [{ label, tone }]
    highlights = [], // [[libellé, valeur], …]
    sections,
    actions,
    onClose,
}) {
    useEffect(() => {
        const onKey = (event) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Photo introuvable (fichier supprimé, adresse du serveur différente) : retour aux initiales / à l'icône.
    const [photoFailed, setPhotoFailed] = useState(false);
    useEffect(() => setPhotoFailed(false), [photoUrl]);

    const tiles = highlights.filter(([, value]) => !isEmpty(value));
    const shown = new Set(tiles.map(([label]) => label));
    const visible = sections
        .map((section) => ({
            ...section,
            fields: section.fields.filter(([label, value]) => !isEmpty(value) && !shown.has(label)),
        }))
        .filter((section) => section.fields.length > 0);

    // Rendue dans <body> : aucune barre de la page (en-tête collant, menu) ne peut passer par-dessus.
    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line bg-surface text-ink shadow-2xl"
            >
                <div className="overflow-y-auto">
                    {/* Bandeau */}
                    <div className={`relative overflow-hidden bg-gradient-to-r from-umg-night-deep via-umg-night to-indigo-600 ${coverUrl ? "h-40 sm:h-52" : "h-28 sm:h-32"}`}>
                        {coverUrl ? (
                            <>
                                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 to-black/10" />
                            </>
                        ) : (
                            <>
                                <span aria-hidden="true" className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
                                <span aria-hidden="true" className="absolute right-24 top-10 h-24 w-24 rounded-full bg-gold/20" />
                                <span aria-hidden="true" className="absolute -left-8 bottom-0 h-20 w-20 rounded-full bg-white/5" />
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fermer"
                            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="px-5 pb-6 sm:px-7">
                        {/* Avatar, nom, badges */}
                        {/* Seul l'avatar chevauche le bandeau (relative z-10 : le bandeau, positionné, serait sinon peint par-dessus) ;
                            le nom et les badges restent sous le bandeau, lisibles. */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
                            {photoUrl && !photoFailed ? (
                                <img
                                    src={photoUrl}
                                    alt={`Photo de ${title}`}
                                    onError={() => setPhotoFailed(true)}
                                    className="relative z-10 -mt-12 h-24 w-24 shrink-0 rounded-3xl object-cover shadow-lg ring-4 ring-surface"
                                />
                            ) : (
                                <div
                                    aria-hidden="true"
                                    className="relative z-10 -mt-12 flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-indigo-100 font-display text-3xl font-extrabold text-brass-deep shadow-lg ring-4 ring-surface"
                                >
                                    {AvatarIcon ? <AvatarIcon className="h-10 w-10" strokeWidth={1.75} /> : initials(title)}
                                </div>
                            )}
                            <div className="min-w-0 sm:pt-3">
                                <h3 className="break-words font-display text-2xl font-extrabold leading-tight">{title}</h3>
                                {subtitle && (
                                    <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-ink-soft">
                                        <SubtitleIcon className="h-3.5 w-3.5 shrink-0" />
                                        {subtitle}
                                    </p>
                                )}
                                {badges.length > 0 && (
                                    <div className="mt-2.5 flex flex-wrap gap-2">
                                        {badges.filter((badge) => badge?.label).map((badge) => (
                                            <span
                                                key={badge.label}
                                                className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${BADGE_TONES[badge.tone] || BADGE_TONES.brand}`}
                                            >
                                                {badge.label}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Informations clés */}
                        {tiles.length > 0 && (
                            <div className={`mt-6 grid gap-3 ${tiles.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                                {tiles.map(([label, value]) => (
                                    <div key={label} className="min-w-0 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-brass">{label}</p>
                                        <p className="mt-1 break-words font-bold text-brass-deep">{value}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Sections */}
                        <div className="mt-6 space-y-4">
                            {visible.map((section) => {
                                const Icon = SECTION_ICONS[section.title] || FileText;
                                return (
                                    <section key={section.title} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                                        <h4 className="mb-4 flex items-center gap-2.5 text-sm font-extrabold">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-brass">
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            {section.title}
                                        </h4>
                                        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                                            {section.fields.map(([label, value]) => (
                                                <div key={label} className="min-w-0">
                                                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                                                    <dd className="mt-0.5 break-words text-sm font-semibold">{value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </section>
                                );
                            })}
                            {visible.length === 0 && tiles.length === 0 && (
                                <p className="text-sm text-slate-500">Aucune information enregistrée.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper px-5 py-4 sm:px-7">
                    {actions}
                    <button type="button" onClick={onClose} className="btn-secondary">Fermer</button>
                </div>
            </div>
        </div>
    , document.body);
}
