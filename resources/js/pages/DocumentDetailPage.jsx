import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    Users,
    Building2,
    Tag,
    Calendar,
    Building,
    Hash,
    LogIn,
    Heart,
    BookOpen,
    Sparkles,
    GraduationCap,
    Library,
    Lock,
} from "lucide-react";
import DOMPurify from "dompurify";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import SecurePdfViewer from "../components/SecurePdfViewer";
import AiAssistant from "../components/AiAssistant";
import CitationDialog from "../components/CitationDialog";
import SimilarDocuments from "../components/SimilarDocuments";
import { SkeletonDocumentDetail } from "../components/Skeleton";
import { TYPE_CONFIG, normalizeType } from "../components/DocumentCard";
import { languageLabel } from "../lib/languages";
import { COVER_SOFT_TEXT, coverColor } from "../lib/coverColor";

// Résumé saisi en texte enrichi : seules quelques balises de mise en forme sont conservées.
function sanitizeAbstract(html) {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li"],
        ALLOWED_ATTR: [],
    });
}

/**
 * Fiche d'un document pour un visiteur non connecté : couverture, titre, résumé et informations
 * bibliographiques sur toute la largeur, et un encart invitant à se connecter pour lire.
 */
function GuestDocumentView({ doc }) {
    // Libellés lisibles : « memoire » → « Mémoire », « fr » → « Français » (valeur saisie sinon).
    const typeLabel = TYPE_CONFIG[normalizeType(doc.type)]?.label ?? doc.type;
    const language = languageLabel(doc.language) || doc.language;
    const details = [
        ["Auteur(s)", doc.authors?.length ? doc.authors.join(", ") : null],
        ["Niveau", doc.niveau],
        ["Bibliothèque", doc.library],
        ["Catégorie", doc.category],
        ["Année", doc.year],
        ["Éditeur", doc.publisher],
        ["ISBN", doc.isbn],
        ["Langue", language],
    ].filter(([, value]) => value);
    const byline = [doc.authors?.join(", "), doc.library, doc.year].filter(Boolean).join(" · ");

    return (
        <div className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
                {/* COUVERTURE */}
                <div className="w-44 sm:w-52 md:w-auto">
                    {doc.cover_url ? (
                        <img
                            src={doc.cover_url}
                            alt={`Couverture de ${doc.title}`}
                            className="aspect-[3/4] w-full rounded-l-md rounded-r-2xl border-l-[6px] border-indigo-800 object-cover"
                        />
                    ) : (
                        <div
                            className="flex aspect-[3/4] w-full flex-col justify-between rounded-l-md rounded-r-2xl border-l-[6px] p-4 text-white"
                            style={{ backgroundColor: coverColor(doc).bg, borderColor: coverColor(doc).spine }}
                        >
                            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COVER_SOFT_TEXT }}>
                                {[typeLabel, doc.year].filter(Boolean).join(" · ")}
                            </span>
                            <span className="font-display text-lg font-extrabold leading-tight [overflow-wrap:anywhere]">{doc.title}</span>
                            <span className="text-[11px] font-semibold" style={{ color: COVER_SOFT_TEXT }}>{doc.category || "Catalogue"}</span>
                        </div>
                    )}
                </div>

                {/* INFORMATIONS */}
                <div className="min-w-0">
                    <Link
                        to="/recherche"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition-colors hover:text-brass"
                    >
                        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                        Retour au catalogue
                    </Link>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                        {typeLabel && (
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-brass-deep">{typeLabel}</span>
                        )}
                        {doc.niveau && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-brass-deep">
                                <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
                                {doc.niveau}
                            </span>
                        )}
                    </div>

                    <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight text-ink [overflow-wrap:anywhere] sm:text-3xl">
                        {doc.title}
                    </h1>
                    {doc.subtitle && <p className="mt-1.5 text-base text-ink-soft [overflow-wrap:anywhere]">{doc.subtitle}</p>}
                    {byline && <p className="mt-2 text-sm text-ink-soft [overflow-wrap:anywhere]">{byline}</p>}

                    {doc.abstract && (
                        <div
                            className="rich-text mt-5 max-w-3xl text-[15px] leading-7 text-ink"
                            dangerouslySetInnerHTML={{ __html: sanitizeAbstract(doc.abstract) }}
                        />
                    )}

                    {/* INFORMATIONS BIBLIOGRAPHIQUES */}
                    {details.length > 0 && (
                        <section className="mt-6 max-w-3xl" aria-labelledby="guest-details-title">
                            <h2 id="guest-details-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brass">
                                <Library className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                                Informations bibliographiques
                            </h2>
                            <dl className="mt-3 grid border-t border-line sm:grid-cols-2 sm:gap-x-8">
                                {details.map(([label, value]) => (
                                    <div key={label} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm">
                                        <dt className="shrink-0 text-ink-soft">{label}</dt>
                                        <dd className="min-w-0 text-right font-semibold text-ink [overflow-wrap:anywhere]">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}

                    {/* ENCART DE CONNEXION */}
                    <div className="mt-8 grid max-w-3xl grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-dashed border-indigo-600 bg-indigo-50 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                        <Lock className="h-5 w-5 text-brass" strokeWidth={1.75} aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="font-display text-sm font-extrabold text-ink">Connectez-vous pour lire ce document</p>
                            <p className="mt-0.5 text-xs text-ink-soft">
                                Lecture en ligne sécurisée et assistant IA réservés aux membres.
                            </p>
                        </div>
                        <Link to="/connexion" className="btn-primary col-span-2 px-4 py-2 text-sm sm:col-span-1">
                            <LogIn className="h-4 w-4" strokeWidth={1.75} />
                            Se connecter
                        </Link>
                    </div>

                    <div className="max-w-3xl">
                        <SimilarDocuments slug={doc.slug} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DocumentDetailPage() {
    const { slug } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [doc, setDoc] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("details");
    const [favorited, setFavorited] = useState(false);
    const [favoriteCount, setFavoriteCount] = useState(0);
    const [favoriteError, setFavoriteError] = useState(null);

    useEffect(() => {
        api.getDocument(slug)
            .then((data) => {
                setDoc(data);
                setFavorited(Boolean(data.is_favorited));
                setFavoriteCount(data.favorite_count || 0);
            })
            .catch(() =>
                setError("Ce document n'existe pas ou n'est plus disponible."),
            );
    }, [slug]);

    async function toggleFavorite() {
        if (!user) return navigate("/connexion");

        setFavoriteError(null);

        try {
            const result = await api.toggleFavorite(doc.slug);
            setFavorited(Boolean(result.favorited));
            setFavoriteCount(Number(result.favorite_count || 0));
        } catch (err) {
            setFavoriteError(
                err?.data?.message ||
                    "Impossible de mettre à jour vos favoris.",
            );
        }
    }

    if (error) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
                <p className="text-ink-soft">{error}</p>

                <Link to="/recherche" className="text-brass mt-4 inline-block">
                    Retour au catalogue
                </Link>
            </div>
        );
    }

    if (!doc) {
        return <SkeletonDocumentDetail />;
    }

    // Même règle que le serveur (Document::isAccessibleBy) : un document restreint
    // n'est lisible que par les membres de sa bibliothèque (ou le personnel).
    const canRead = Boolean(user && doc?.can_view_content);
    // « Reprendre la lecture » : dernière page lue enregistrée pour ce lecteur.
    const resumePage = doc.reading_progress?.last_page || null;

    // Visiteur non connecté : fiche pleine largeur avec l'encart « Connectez-vous pour lire ».
    if (!user) {
        return <GuestDocumentView doc={doc} />;
    }

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-7 xl:flex xl:h-[calc(100dvh-var(--app-header-height))] xl:flex-col xl:overflow-hidden xl:py-4">
            {/* =========================================================
                RETOUR AU CATALOGUE
            ========================================================= */}
            <Link
                to="/recherche"
                className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-brass transition-colors"
            >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                Retour au catalogue
            </Link>

            {/* =========================================================
                CONTENU PRINCIPAL
                LES DEUX BLOCS ONT LA MÊME HAUTEUR
            ========================================================= */}
            <div className="mt-5 flex flex-col xl:flex-row gap-5 items-stretch xl:mt-3 xl:min-h-0 xl:flex-1">
                {/* =====================================================
                    BLOC GAUCHE
                    COUVERTURE + INFORMATIONS
                    (défile seul sur grand écran pour garder la lecture visible)
                ===================================================== */}
                <div className="w-full xl:w-[330px] 2xl:w-[350px] flex-shrink-0 self-stretch xl:min-h-0 xl:overflow-y-auto">
                    <div className="w-full h-full xl:h-auto xl:min-h-full border border-line bg-paper rounded-xl overflow-hidden flex flex-col">
                        <div className="p-4 flex-1">
                            {/* =================================================
                                COUVERTURE + INFORMATIONS À CÔTÉ
                            ================================================= */}
                            <div className="flex gap-4">
                                {/* COUVERTURE */}
                                <div className="w-[105px] sm:w-[115px] flex-shrink-0">
                                    <div className="border border-line rounded-lg overflow-hidden bg-paper-dim">
                                        {doc.cover_url ? (
                                            <img
                                                src={doc.cover_url}
                                                alt={`Couverture de ${doc.title}`}
                                                className="w-full aspect-[3/4] object-cover"
                                            />
                                        ) : (
                                            <div
                                                className="w-full aspect-[3/4] flex flex-col items-center justify-center px-2 text-center"
                                                style={{ backgroundColor: coverColor(doc).bg, color: COVER_SOFT_TEXT }}
                                            >
                                                <BookOpen
                                                    className="h-7 w-7 mb-2"
                                                    strokeWidth={1.25}
                                                />

                                                <span className="text-[10px] leading-tight">
                                                    Aucune couverture
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* INFORMATIONS À DROITE */}
                                <div className="flex-1 min-w-0">
                                    {/* TYPE + NIVEAU */}
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="inline-flex items-center rounded-full border border-brass bg-indigo-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-brass">
                                            {doc.type}
                                        </span>

                                        {doc.niveau && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[10px] font-medium text-slate-950">
                                                <GraduationCap
                                                    className="h-3 w-3 text-slate-950"
                                                    strokeWidth={1.5}
                                                />
                                                {doc.niveau}
                                            </span>
                                        )}
                                    </div>

                                    {/* TITRE */}
                                    <h1 className="font-display text-lg sm:text-xl text-ink leading-tight mt-2">
                                        {doc.title}
                                    </h1>

                                    {doc.subtitle && (
                                        <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                                            {doc.subtitle}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* =================================================
                                INFORMATIONS BIBLIOGRAPHIQUES
                            ================================================= */}
                            <div className="border-t border-line mt-4 pt-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <Library
                                        className="h-3.5 w-3.5 text-brass"
                                        strokeWidth={1.75}
                                    />

                                    <h2 className="text-[10px] font-semibold uppercase tracking-wider text-ink">
                                        Informations bibliographiques
                                    </h2>
                                </div>

                                <dl className="space-y-3">
                                    {/* AUTEUR */}
                                    {doc.authors?.length > 0 && (
                                        <div className="flex items-start gap-2.5">
                                            <Users
                                                className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                                strokeWidth={1.5}
                                            />

                                            <div className="min-w-0">
                                                <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                    Auteur(s)
                                                </dt>

                                                <dd className="text-xs text-slate-950 leading-relaxed">
                                                    {doc.authors.join(", ")}
                                                </dd>
                                            </div>
                                        </div>
                                    )}

                                    {/* NIVEAU */}
                                    {doc.niveau && (
                                        <div className="flex items-start gap-2.5">
                                            <GraduationCap
                                                className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                                strokeWidth={1.5}
                                            />

                                            <div>
                                                <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                    Niveau
                                                </dt>

                                                <dd className="text-xs font-medium text-slate-950">
                                                    {doc.niveau}
                                                </dd>
                                            </div>
                                        </div>
                                    )}

                                    {/* BIBLIOTHÈQUE */}
                                    <div className="flex items-start gap-2.5">
                                        <Building2
                                            className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                            strokeWidth={1.5}
                                        />

                                        <div className="min-w-0">
                                            <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                Bibliothèque
                                            </dt>

                                            <dd className="text-xs text-slate-950 leading-relaxed">
                                                {doc.library || "Non précisée"}
                                            </dd>
                                        </div>
                                    </div>

                                    {/* CATÉGORIE */}
                                    <div className="flex items-start gap-2.5">
                                        <Tag
                                            className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                            strokeWidth={1.5}
                                        />

                                        <div className="min-w-0">
                                            <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                Catégorie
                                            </dt>

                                            <dd className="text-xs text-slate-950">
                                                {doc.category || "Non précisée"}
                                            </dd>
                                        </div>
                                    </div>

                                    {/* ANNÉE */}
                                    {doc.year && (
                                        <div className="flex items-start gap-2.5">
                                            <Calendar
                                                className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                                strokeWidth={1.5}
                                            />

                                            <div>
                                                <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                    Année
                                                </dt>

                                                <dd className="text-xs text-slate-950">
                                                    {doc.year}
                                                </dd>
                                            </div>
                                        </div>
                                    )}

                                    {/* ÉDITEUR */}
                                    {doc.publisher && (
                                        <div className="flex items-start gap-2.5">
                                            <Building
                                                className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                                strokeWidth={1.5}
                                            />

                                            <div className="min-w-0">
                                                <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                    Éditeur
                                                </dt>

                                                <dd className="text-xs text-slate-950 leading-relaxed">
                                                    {doc.publisher}
                                                </dd>
                                            </div>
                                        </div>
                                    )}

                                    {/* ISBN */}
                                    {doc.isbn && (
                                        <div className="flex items-start gap-2.5">
                                            <Hash
                                                className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 mt-0.5"
                                                strokeWidth={1.5}
                                            />

                                            <div className="min-w-0">
                                                <dt className="text-[9px] uppercase tracking-wider text-blue-700 mb-0.5">
                                                    ISBN
                                                </dt>

                                                <dd className="text-xs text-slate-950 font-mono break-all">
                                                    {doc.isbn}
                                                </dd>
                                            </div>
                                        </div>
                                    )}
                                </dl>
                            </div>

                            {/* =================================================
                                RÉSUMÉ
                            ================================================= */}
                            {doc.abstract && (
                                <div className="border-t border-line mt-4 pt-4">
                                    <h2 className="text-[10px] font-semibold uppercase tracking-wider text-ink mb-2">
                                        Résumé
                                    </h2>

                                    <div
                                        className="rich-text text-xs text-ink-soft leading-5"
                                        dangerouslySetInnerHTML={{
                                            __html: sanitizeAbstract(doc.abstract),
                                        }}
                                    />
                                </div>
                            )}

                            {/* =================================================
                                ACTIONS
                            ================================================= */}
                            <div className="border-t border-line mt-4 pt-4 space-y-2">
                                {!user && (
                                    <Link
                                        to="/connexion"
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs text-paper hover:bg-brass-deep transition-colors"
                                    >
                                        <LogIn
                                            className="h-3.5 w-3.5"
                                            strokeWidth={1.75}
                                        />
                                        Se connecter pour consulter
                                    </Link>
                                )}

                                {user && (
                                    <button
                                        type="button"
                                        onClick={toggleFavorite}
                                        className="w-full flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ink hover:border-brass hover:text-brass transition-colors"
                                    >
                                        <Heart
                                            className={`h-3.5 w-3.5 ${
                                                favorited
                                                    ? "fill-current text-rose-500"
                                                    : ""
                                            }`}
                                        />

                                        {favorited
                                            ? "Retirer des favoris"
                                            : "Ajouter aux favoris"}

                                        <span className="text-[10px] text-ink-soft">
                                            ({favoriteCount})
                                        </span>
                                    </button>
                                )}

                                {/* Citation réservée aux utilisateurs connectés (masquée aux visiteurs). */}
                                {user && <CitationDialog doc={doc} />}

                                {user && !canRead && (
                                    <p className="rounded-lg border border-line bg-paper-dim px-3 py-2 text-xs text-ink-soft">
                                        {doc.access_level === "restreint"
                                            ? "Ce document est réservé aux membres de sa bibliothèque."
                                            : "Votre compte n'a pas accès à la lecture de ce document."}
                                    </p>
                                )}

                                {favoriteError && (
                                    <p className="text-[10px] text-rose-700" role="alert">
                                        {favoriteError}
                                    </p>
                                )}
                            </div>

                            <SimilarDocuments slug={doc.slug} />
                        </div>
                    </div>
                </div>

                {/* =====================================================
                    COLONNE DROITE
                    GRANDE ZONE LECTURE / IA
                ===================================================== */}
                {canRead && (
                    <div className="w-full xl:flex-1 min-w-0 self-stretch xl:min-h-0">
                        <div className="w-full h-full border border-line bg-paper rounded-xl overflow-hidden flex flex-col">
                            {/* ONGLETS */}
                            <div className="flex gap-1 px-4 sm:px-5 border-b border-line flex-shrink-0">
                                <div className="flex gap-1" role="tablist" aria-label="Lecture du document">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === "details"}
                                    onClick={() => setTab("details")}
                                    className={`flex items-center gap-2 px-4 py-3 text-sm ${
                                        tab === "details"
                                            ? "text-ink border-b-2 border-brass font-medium"
                                            : "text-ink-soft hover:text-ink"
                                    }`}
                                >
                                    <BookOpen
                                        className="h-4 w-4"
                                        strokeWidth={1.75}
                                    />
                                    Lecture
                                </button>

                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === "ai"}
                                    onClick={() => setTab("ai")}
                                    className={`flex items-center gap-2 px-4 py-3 text-sm ${
                                        tab === "ai"
                                            ? "text-ink border-b-2 border-brass font-medium"
                                            : "text-ink-soft hover:text-ink"
                                    }`}
                                >
                                    <Sparkles
                                        className="h-4 w-4"
                                        strokeWidth={1.75}
                                    />
                                    Assistant IA
                                </button>
                                </div>

                                {resumePage > 1 && tab === "details" && (
                                    <p className="ml-auto hidden self-center text-xs text-ink-soft sm:block">
                                        Reprise de votre lecture à la page {resumePage}
                                        {doc.reading_progress?.total_pages ? ` sur ${doc.reading_progress.total_pages}` : ""}
                                    </p>
                                )}
                            </div>

                            {/* CONTENU PDF / IA */}
                            <div className="p-3 sm:p-4 flex-1 min-h-0">
                                {tab === "details" ? (
                                    <SecurePdfViewer
                                        slug={doc.slug}
                                        readerName={user?.name}
                                        libraryName={doc.library}
                                        initialPage={resumePage}
                                    />
                                ) : (
                                    <AiAssistant slug={doc.slug} />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
