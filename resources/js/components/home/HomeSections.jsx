import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Search,
    Sparkles,
    ShieldCheck,
    LibraryBig,
    BookOpen,
    UserPlus,
    Building2,
    BarChart3,
    Megaphone,
    Scale,
    Monitor,
    Stethoscope,
    TrendingUp,
    Calculator,
    FlaskConical,
    Feather,
    Languages,
    Leaf,
    Landmark,
    Globe,
    GraduationCap,
    Users,
    Palette,
    Eye,
} from "lucide-react";
import { api } from "../../lib/api";
import { DEFAULT_HERO_IMAGE, DEFAULT_HERO_IMAGE_ALT, SIGNUP_IMAGE, homepageImageUrl, safeLink } from "../../lib/homepage";
import SearchBar from "../SearchBar";
import { Cover, docInfo } from "../CatalogueCard";
import { stripHtml } from "../../lib/utils";
import LibraryCard from "../LibraryCard";

/**
 * Rendu des sections de la page d'accueil à partir de la configuration publiée (ou du brouillon
 * en aperçu). Tout le contenu est affiché comme du texte : aucun HTML de l'administrateur n'est
 * interprété. Un style non défini conserve exactement l'apparence d'origine.
 */

const cx = (...classes) => classes.filter(Boolean).join(" ");

const TITLE_SIZES = { sm: "text-xl", md: "text-2xl", lg: "text-3xl sm:text-4xl" };
const HERO_TITLE_SIZES = { sm: "text-2xl sm:text-4xl", md: "text-2xl sm:text-5xl", lg: "text-3xl sm:text-6xl" };
const WEIGHTS = { normal: "font-normal", semibold: "font-semibold", bold: "font-bold", extrabold: "font-extrabold" };
const SPACING = { sm: "py-4", md: "py-8", lg: "py-14" };
const HERO_FEATURE_ICONS = [Search, Sparkles, ShieldCheck];

// Données publiques partagées entre sections (et entre rendus de l'aperçu) pendant une minute.
const dataCache = new Map();
const LOADERS = {
    // Domaines réellement disponibles : catégories ayant au moins un document publié.
    categories: () => api.getCategories({ published: 1 }),
    documents: () => api.searchDocuments({}),
    libraries: () => api.getLibraries(),
};

function usePublicData(key) {
    const [data, setData] = useState(() => dataCache.get(key)?.value);

    useEffect(() => {
        let alive = true;
        let entry = dataCache.get(key);
        if (!entry || Date.now() - entry.at > 60_000) {
            entry = { at: Date.now(), promise: LOADERS[key]() };
            entry.promise.then((value) => (entry.value = value)).catch(() => {});
            dataCache.set(key, entry);
        }
        entry.promise
            .then((value) => alive && setData(value))
            .catch(() => alive && setData(null));
        return () => {
            alive = false;
        };
    }, [key]);

    return data;
}

// Couleur de texte personnalisée : seulement sur un fond maîtrisé (hero ou fond choisi),
// sinon elle deviendrait illisible en mode sombre.
function textColorOf(section) {
    const { text_color, bg_color } = section.style || {};
    return text_color && (section.type === "hero" || bg_color) ? { color: text_color } : undefined;
}

function SmartLink({ to, className, style, children }) {
    const link = safeLink(to);
    if (!link) return null;

    return link.internal ? (
        <Link to={link.href} className={className} style={style}>
            {children}
        </Link>
    ) : (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
            {children}
        </a>
    );
}

function Shell({ section, spacing, children }) {
    const style = section.style || {};

    return (
        <section
            className={cx(
                "w-full px-4 sm:px-8 xl:px-10",
                SPACING[style.spacing] ?? spacing,
                style.align === "center" && "text-center",
            )}
            style={style.bg_color ? { backgroundColor: style.bg_color } : undefined}
        >
            {children}
        </section>
    );
}

function Heading({ section, icon: Icon, action, className = "mb-5" }) {
    const { label, title } = section.content || {};
    const style = section.style || {};
    const color = textColorOf(section);
    const centered = style.align === "center";

    if (!label && !title && !action) return null;

    return (
        <div className={cx(className, "flex gap-4", centered ? "flex-col items-center" : "items-end justify-between")}>
            <div className="min-w-0">
                {label && (
                    <p className="section-label" style={color}>
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                        {label}
                    </p>
                )}
                {title && (
                    <h2
                        className={cx(
                            "mt-1 font-display [overflow-wrap:anywhere]",
                            TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-2xl",
                            WEIGHTS[style.title_weight] ?? "font-extrabold",
                        )}
                        style={color}
                    >
                        {title}
                    </h2>
                )}
            </div>
            {action}
        </div>
    );
}

// Aperçu uniquement : signale une section qui n'affichera rien sur la page publique.
function PreviewNote({ section, children }) {
    return (
        <Shell section={section} spacing="py-6">
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                {children}
            </div>
        </Shell>
    );
}

function withHighlight(title, highlight, className) {
    const index = highlight ? title.indexOf(highlight) : -1;
    if (index < 0) return title;

    return (
        <>
            {title.slice(0, index)}
            <span className={className}>{highlight}</span>
            {title.slice(index + highlight.length)}
        </>
    );
}

// Explication affichée sous un point fort resté à sa valeur d'origine ; un libellé modifié s'affiche seul.
const FEATURE_DETAILS = {
    recherche: "Par titre, auteur, domaine ou mot-clé, dans toutes les bibliothèques.",
    "analyse ia": "Interrogez chaque document avec l'assistant IA pendant la lecture.",
    "consultation sécurisée": "Lecture en ligne dans le lecteur intégré, sans téléchargement.",
};

/**
 * Bandeau d'accueil « Vitrine » : bannière pleine largeur (image téléversée, sinon la bannière
 * de l'Université), puis une bande pleine (couleur principale) avec le titre, la description et la
 * recherche, et enfin les points forts en cartes.
 */
function HeroSection({ section }) {
    const c = section.content;
    const style = section.style || {};
    const color = textColorOf(section);
    const centered = style.align === "center";
    const features = (c.features || []).filter(Boolean);
    const customImage = homepageImageUrl(c.image);
    const hasText = c.badge || c.title || c.description || c.show_search;

    return (
        <section className="w-full px-4 pt-6 sm:px-8 xl:px-10">
            <div className="overflow-hidden rounded-[30px]">
                {c.show_image && (
                    // Bannière sur toute la largeur du bloc, affichée entière (jamais recadrée) : sa hauteur
                    // suit sa proportion naturelle. Seule une image téléversée (proportion inconnue, parfois
                    // très haute) est limitée à la hauteur de l'écran, sans être coupée.
                    <div className="w-full bg-indigo-100">
                        <img
                            src={customImage || DEFAULT_HERO_IMAGE}
                            alt={customImage ? c.image_alt || "" : DEFAULT_HERO_IMAGE_ALT}
                            width="1600"
                            height="900"
                            fetchPriority="high"
                            decoding="async"
                            className={cx("block h-auto w-full", customImage && "mx-auto max-h-[85vh] object-contain")}
                        />
                    </div>
                )}
                {hasText && (
                    <div
                        className={cx(
                            "grid gap-6 p-6 text-white sm:p-8 lg:p-10",
                            !style.bg_color && "bg-indigo-600",
                            c.show_search && !centered && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center",
                            centered && "justify-items-center text-center",
                        )}
                        style={{ ...(style.bg_color ? { backgroundColor: style.bg_color } : {}), ...color }}
                    >
                        <div className="min-w-0">
                            {c.badge && (
                                <span className="badge-modern w-fit max-w-full bg-surface text-brass-deep">
                                    <LibraryBig className="h-3.5 w-3.5 shrink-0" />
                                    <span className="[overflow-wrap:anywhere]">{c.badge}</span>
                                </span>
                            )}
                            {c.title && (
                                <h1
                                    className={cx(
                                        "font-display leading-[1.1] tracking-tight [overflow-wrap:anywhere]",
                                        c.badge && "mt-4",
                                        HERO_TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-3xl",
                                        WEIGHTS[style.title_weight] ?? "font-extrabold",
                                    )}
                                >
                                    {withHighlight(c.title, c.highlight, color ? "underline decoration-4 underline-offset-8" : "text-on-primary-soft")}
                                </h1>
                            )}
                            {c.description && (
                                <p
                                    className={cx("mt-3 max-w-2xl text-sm leading-6 sm:text-base [overflow-wrap:anywhere]", !color && "text-on-primary-soft", centered && "mx-auto")}
                                    style={color}
                                >
                                    {c.description}
                                </p>
                            )}
                        </div>
                        {c.show_search && (
                            <div className={cx("w-full max-w-2xl rounded-2xl bg-surface p-2 text-left", centered && "mx-auto")}>
                                <SearchBar />
                            </div>
                        )}
                    </div>
                )}
            </div>
            {features.length > 0 && (
                <div className={cx("mt-6 grid gap-4 sm:grid-cols-2", features.length >= 3 && "lg:grid-cols-3", features.length === 4 && "xl:grid-cols-4")}>
                    {features.map((feature, index) => {
                        const Icon = HERO_FEATURE_ICONS[index % HERO_FEATURE_ICONS.length];
                        const detail = FEATURE_DETAILS[feature.trim().toLowerCase()];
                        return (
                            <div key={index} className="modern-card flex gap-3 p-5">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-brass">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-display text-base font-bold [overflow-wrap:anywhere]">{feature}</p>
                                    {detail && <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

// Icône d'un domaine d'après son nom (sans accents ni casse) ; livre par défaut.
const DOMAIN_ICONS = [
    [/droit|jurid|justice|loi/, Scale],
    [/informati|numerique|logiciel|reseau|programm/, Monitor],
    [/sante|medec|pharma|infirm|biomed|odonto/, Stethoscope],
    [/econom|gestion|financ|commerce|compta|management|marketing/, TrendingUp],
    [/math|statist/, Calculator],
    [/scien|physique|chimie|biolog|technolog|ingenier/, FlaskConical],
    [/lettre|litter|philo|linguist/, Feather],
    [/langue|anglais|francais|malgache/, Languages],
    [/environ|ecolog|agro|agricul|foret|mer|ocean|halieut/, Leaf],
    [/histoire|archeo|patrimoine/, Landmark],
    [/geograph|tourism/, Globe],
    [/educat|pedagog|enseign/, GraduationCap],
    [/socio|psycho|anthropo|social/, Users],
    [/art|musique|cinema|design/, Palette],
];

function domainIcon(name) {
    const key = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return DOMAIN_ICONS.find(([pattern]) => pattern.test(key))?.[1] ?? BookOpen;
}

function CategoriesSection({ section, preview }) {
    const categories = usePublicData("categories") || [];

    if (!categories.length) {
        return preview ? <PreviewNote section={section}>Domaines : aucun domaine à afficher pour le moment.</PreviewNote> : null;
    }

    return (
        <Shell section={section} spacing="py-10">
            <Heading section={section} icon={BookOpen} />
            <div className="grid grid-cols-1 gap-3 text-left min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {categories.map((category) => {
                    const Icon = domainIcon(category.name);
                    const count = category.documents_count;
                    return (
                        <Link
                            key={category.id}
                            to={`/recherche?category_id=${category.id}`}
                            className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3.5 transition-colors hover:border-indigo-600 focus-visible:border-indigo-600"
                        >
                            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-brass transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                                <Icon className="h-5 w-5" strokeWidth={1.8} />
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate font-display text-[15px] font-bold text-slate-900" title={category.name}>
                                    {category.name}
                                </span>
                                {count != null && (
                                    <span className="block text-xs tabular-nums text-slate-500">
                                        {count} document{count > 1 ? "s" : ""}
                                    </span>
                                )}
                            </span>
                            <ArrowRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brass" aria-hidden="true" />
                        </Link>
                    );
                })}
            </div>
        </Shell>
    );
}

// « À la une » : la publication la plus récente en vedette, les suivantes en lignes compactes.
function FeaturedDocument({ document }) {
    const { typeCfg, authors } = docInfo(document);
    const summary = document.abstract ? stripHtml(document.abstract).trim() : "";
    const views = document.consultation_count ?? 0;

    return (
        <article className="grid gap-5 rounded-[20px] border border-slate-200 bg-surface p-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6">
            <Link to={`/documents/${document.slug}`} className="block w-40 sm:w-auto" tabIndex={-1} aria-hidden="true">
                <Cover document={document} typeCfg={typeCfg} />
            </Link>
            <div className="flex min-w-0 flex-col">
                <span className="w-fit rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-brass-deep">À la une</span>
                <h3 className="mt-2 font-display text-xl font-extrabold leading-tight text-slate-900 [overflow-wrap:anywhere] sm:text-2xl">
                    <Link to={`/documents/${document.slug}`} className="hover:text-brass-deep">
                        {document.title}
                    </Link>
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 [overflow-wrap:anywhere]">
                    {[authors, typeCfg.label, document.year, document.library].filter(Boolean).join(" · ")}
                </p>
                {summary && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{summary}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-4 pt-4">
                    <Link to={`/documents/${document.slug}`} className="btn-primary px-4 py-2 text-sm">
                        Consulter
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
                        <Eye className="h-3.5 w-3.5" />
                        {views} consultation{views > 1 ? "s" : ""}
                    </span>
                </div>
            </div>
        </article>
    );
}

function CompactDocument({ document }) {
    const { typeCfg, authors } = docInfo(document);

    return (
        <li>
            <Link
                to={`/documents/${document.slug}`}
                className="group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-2.5 transition-colors hover:border-indigo-600 focus-visible:border-indigo-600"
            >
                <Cover document={document} typeCfg={typeCfg} small />
                <span className="min-w-0">
                    <span className="line-clamp-2 font-display text-sm font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-brass-deep">
                        {document.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {authors} · {typeCfg.label}
                    </span>
                </span>
                {document.year && <span className="pr-1 text-xs tabular-nums text-slate-500">{document.year}</span>}
            </Link>
        </li>
    );
}

function DocumentsSection({ section, preview }) {
    const response = usePublicData("documents");
    const documents = (response?.data || []).slice(0, section.content.limit || 6);
    if (!documents.length) {
        return preview ? <PreviewNote section={section}>Documents récents : aucun document publié pour le moment.</PreviewNote> : null;
    }
    const [featured, ...others] = documents;
    const action = section.content.link_text ? (
        <Link
            to="/recherche"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-brass transition hover:text-brass-deep"
        >
            {section.content.link_text}
            <ArrowRight className="h-4 w-4" />
        </Link>
    ) : null;
    return (
        <Shell section={section} spacing="py-6">
            <Heading section={section} icon={Sparkles} action={action} className="mb-6" />
            <div className={cx("grid gap-4 text-left", others.length > 0 && "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]")}>
                <FeaturedDocument document={featured} />
                {others.length > 0 && (
                    <ul className="grid content-start gap-2.5">
                        {others.map((doc) => (
                            <CompactDocument key={doc.slug} document={doc} />
                        ))}
                    </ul>
                )}
            </div>
        </Shell>
    );
}

function LibrariesSection({ section, preview }) {
    const libraries = (usePublicData("libraries") || []).slice(0, section.content.limit || 6);

    if (!libraries.length) {
        return preview ? <PreviewNote section={section}>Bibliothèques : aucune bibliothèque à afficher.</PreviewNote> : null;
    }

    return (
        <Shell section={section} spacing="py-8">
            <Heading section={section} icon={Building2} />
            <div className="grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
                {libraries.map((library) => (
                    <LibraryCard key={library.id} library={library} />
                ))}
            </div>
        </Shell>
    );
}

function StatsSection({ section, preview }) {
    const c = section.content;
    const documents = usePublicData("documents");
    const libraries = usePublicData("libraries");
    const categories = usePublicData("categories");

    const items = [
        c.show_documents && { label: "Documents", value: documents?.total },
        c.show_libraries && { label: "Bibliothèques", value: libraries?.length },
        c.show_categories && { label: "Domaines", value: categories?.length },
    ].filter(Boolean);

    if (!items.length) {
        return preview ? <PreviewNote section={section}>Statistiques : aucun chiffre sélectionné.</PreviewNote> : null;
    }

    return (
        <Shell section={section} spacing="py-8">
            <Heading section={section} icon={BarChart3} />
            <div className="grid gap-4 sm:grid-cols-3">
                {items.map((item) => (
                    <div key={item.label} className="modern-card p-5">
                        <p className="font-display text-3xl font-extrabold text-brass">
                            {item.value ?? "—"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{item.label}</p>
                    </div>
                ))}
            </div>
        </Shell>
    );
}

function TextSection({ section }) {
    const color = textColorOf(section);
    const centered = section.style?.align === "center";

    return (
        <Shell section={section} spacing="py-8">
            <Heading section={section} className="mb-4" />
            {section.content.body && (
                <p
                    className={cx(
                        "max-w-3xl whitespace-pre-line text-base leading-7 [overflow-wrap:anywhere]",
                        !color && "text-slate-600",
                        centered && "mx-auto",
                    )}
                    style={color}
                >
                    {section.content.body}
                </p>
            )}
        </Shell>
    );
}

function ImageSection({ section, preview }) {
    const c = section.content;
    const color = textColorOf(section);

    if (!c.image) {
        return preview ? <PreviewNote section={section}>Image : aucune image choisie.</PreviewNote> : null;
    }

    return (
        <Shell section={section} spacing="py-8">
            <figure>
                <img
                    src={homepageImageUrl(c.image)}
                    alt={c.alt || ""}
                    className="max-h-[520px] w-full rounded-2xl object-cover"
                />
                {c.caption && (
                    <figcaption
                        className={cx("mt-3 text-sm [overflow-wrap:anywhere]", !color && "text-slate-500")}
                        style={color}
                    >
                        {c.caption}
                    </figcaption>
                )}
            </figure>
        </Shell>
    );
}

function CardsSection({ section }) {
    const items = (section.content.items || []).filter((item) => item.title || item.text);

    return (
        <Shell section={section} spacing="py-8">
            <Heading section={section} icon={Sparkles} />
            <div className="grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, index) => (
                    <div key={index} className="modern-card flex flex-col p-5">
                        {item.title && <h3 className="font-display text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">{item.title}</h3>}
                        {item.text && <p className="mt-2 flex-1 text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{item.text}</p>}
                        <SmartLink
                            to={item.link}
                            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brass hover:text-brass-deep"
                        >
                            En savoir plus
                            <ArrowRight className="h-4 w-4" />
                        </SmartLink>
                    </div>
                ))}
            </div>
        </Shell>
    );
}

// Encadré texte + bouton : « Appel à l'action » et « Inscription » (même présentation qu'avant).
function CallToAction({ section, icon: Icon, note }) {
    const c = section.content;
    const style = section.style || {};
    const centered = style.align === "center";

    return (
        <Shell section={section} spacing="py-8 sm:py-10">
            <div
                className={cx(
                    "modern-card flex flex-col justify-between gap-7 p-7 sm:p-10",
                    centered ? "items-center" : "lg:flex-row lg:items-center",
                )}
            >
                <div className="min-w-0">
                    {note}
                    {c.label && (
                        <p className="section-label">
                            <Icon className="h-3.5 w-3.5" />
                            {c.label}
                        </p>
                    )}
                    {c.title && (
                        <h2
                            className={cx(
                                "mt-2 font-display [overflow-wrap:anywhere]",
                                TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-2xl",
                                WEIGHTS[style.title_weight] ?? "font-extrabold",
                            )}
                        >
                            {c.title}
                        </h2>
                    )}
                    {c.description && (
                        <p className={cx("mt-2 max-w-2xl text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]", centered && "mx-auto")}>
                            {c.description}
                        </p>
                    )}
                </div>

                {c.button_text && (
                    <SmartLink
                        to={c.button_link}
                        className="btn-primary max-w-full shrink-0"
                        style={style.button_color ? { "--btn-bg": style.button_color } : undefined}
                    >
                        <span className="[overflow-wrap:anywhere]">{c.button_text}</span>
                        <ArrowRight className="h-4 w-4 shrink-0" />
                    </SmartLink>
                )}
            </div>
        </Shell>
    );
}

function CtaSection({ section }) {
    return <CallToAction section={section} icon={Megaphone} />;
}

/**
 * Invitation à s'inscrire : photo de la salle de lecture à côté d'un panneau plein (couleur principale,
 * ou couleur de fond choisie). Les réglages de l'éditeur (alignement, tailles, couleurs) s'appliquent.
 */
function SignupSection({ section, user, preview }) {
    if (section.content.guests_only && user && !preview) return null;

    const c = section.content;
    const style = section.style || {};
    const centered = style.align === "center";
    const color = style.text_color ? { color: style.text_color } : undefined;

    return (
        <Shell section={{ ...section, style: { ...style, bg_color: undefined } }} spacing="py-8 sm:py-10">
            <div
                className={cx("grid overflow-hidden rounded-[30px] text-white md:grid-cols-2", !style.bg_color && "bg-indigo-600")}
                style={style.bg_color ? { backgroundColor: style.bg_color } : undefined}
            >
                <img
                    src={SIGNUP_IMAGE}
                    alt=""
                    width="1600"
                    height="800"
                    loading="lazy"
                    decoding="async"
                    className="h-48 w-full object-cover md:h-full md:min-h-[260px]"
                />
                <div className={cx("flex min-w-0 flex-col justify-center gap-3 p-7 sm:p-10", centered && "items-center text-center")} style={color}>
                    {preview && c.guests_only && (
                        <p className="w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                            Visible uniquement par les visiteurs non connectés
                        </p>
                    )}
                    {c.label && (
                        <p className={cx("section-label", !color && "text-on-primary-soft!")} style={color}>
                            <UserPlus className="h-3.5 w-3.5" />
                            {c.label}
                        </p>
                    )}
                    {c.title && (
                        <h2
                            className={cx(
                                "font-display [overflow-wrap:anywhere]",
                                TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-3xl",
                                WEIGHTS[style.title_weight] ?? "font-extrabold",
                            )}
                        >
                            {c.title}
                        </h2>
                    )}
                    {c.description && (
                        <p className={cx("max-w-xl text-sm leading-6 [overflow-wrap:anywhere]", !color && "text-on-primary-soft")}>
                            {c.description}
                        </p>
                    )}
                    {c.button_text && (
                        <SmartLink
                            to={c.button_link}
                            className={cx(
                                "mt-2 inline-flex w-fit max-w-full items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition",
                                !style.button_color && "bg-surface text-brass-deep hover:bg-indigo-50",
                            )}
                            style={style.button_color ? { backgroundColor: style.button_color, color: "#ffffff" } : undefined}
                        >
                            <span className="[overflow-wrap:anywhere]">{c.button_text}</span>
                            <ArrowRight className="h-4 w-4 shrink-0" />
                        </SmartLink>
                    )}
                </div>
            </div>
        </Shell>
    );
}

const RENDERERS = {
    hero: HeroSection,
    categories: CategoriesSection,
    documents: DocumentsSection,
    libraries: LibrariesSection,
    stats: StatsSection,
    text: TextSection,
    image: ImageSection,
    cards: CardsSection,
    cta: CtaSection,
    signup: SignupSection,
};

export default function HomeSections({ sections, user, isLocked = false, preview = false }) {
    return sections
        .filter((section) => section.visible && RENDERERS[section.type])
        .map((section) => {
            const Section = RENDERERS[section.type];
            return (
                <Section
                    key={section.id}
                    section={{ ...section, content: section.content || {}, style: section.style || {} }}
                    user={user}
                    isLocked={isLocked}
                    preview={preview}
                />
            );
        });
}
