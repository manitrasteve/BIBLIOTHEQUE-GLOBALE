import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    ChevronLeft,
    ChevronRight,
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
import { docInfo } from "../CatalogueCard";
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

    // Fond (couleur choisie) sur toute la largeur ; contenu centré dans le conteneur de la charte UMG.
    return (
        <section
            className={cx("w-full", SPACING[style.spacing] ?? spacing)}
            style={style.bg_color ? { backgroundColor: style.bg_color } : undefined}
        >
            <div className={cx("umg-container", style.align === "center" && "text-center")}>{children}</div>
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
        <div className={cx(className, "flex gap-4", centered ? "flex-col items-center" : "flex-wrap items-end justify-between")}>
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
                            "mt-1.5 font-display tracking-tight text-ink [overflow-wrap:anywhere]",
                            TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-[28px]",
                            WEIGHTS[style.title_weight] ?? "font-bold",
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
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
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
        <section className="umg-container pt-6">
            <div className="overflow-hidden rounded-lg">
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
                            !style.bg_color && "bg-indigo-800",
                            c.show_search && !centered && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center",
                            centered && "justify-items-center text-center",
                        )}
                        style={{ ...(style.bg_color ? { backgroundColor: style.bg_color } : {}), ...color }}
                    >
                        <div className="min-w-0">
                            {c.badge && (
                                // Sur-titre en capitales espacées (charte UMG : « Actualité de l'Université »).
                                <p
                                    className={cx(
                                        "flex w-fit max-w-full items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]",
                                        !color && "text-on-primary-soft",
                                        centered && "mx-auto",
                                    )}
                                    style={color}
                                >
                                    <LibraryBig className="h-3.5 w-3.5 shrink-0" />
                                    <span className="[overflow-wrap:anywhere]">{c.badge}</span>
                                </p>
                            )}
                            {c.title && (
                                <h1
                                    className={cx(
                                        "font-display leading-[1.15] tracking-tight [overflow-wrap:anywhere]",
                                        c.badge && "mt-3",
                                        HERO_TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-[34px]",
                                        WEIGHTS[style.title_weight] ?? "font-bold",
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
                            <div className={cx("w-full max-w-2xl rounded-md bg-surface p-2 text-left", centered && "mx-auto")}>
                                <SearchBar />
                            </div>
                        )}
                    </div>
                )}
            </div>
            {features.length > 0 && (
                // Tuiles reliées par des filets, comme les « Accès rapides » du site de l'Université.
                <div
                    className={cx(
                        "mt-6 grid pl-px pt-px sm:grid-cols-2",
                        features.length >= 3 && "lg:grid-cols-3",
                        features.length === 4 && "xl:grid-cols-4",
                    )}
                >
                    {features.map((feature, index) => {
                        const Icon = HERO_FEATURE_ICONS[index % HERO_FEATURE_ICONS.length];
                        const detail = FEATURE_DETAILS[feature.trim().toLowerCase()];
                        return (
                            <div key={index} className="-ml-px -mt-px flex gap-3.5 border border-line bg-surface p-5">
                                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brass" strokeWidth={1.8} />
                                <div className="min-w-0">
                                    <p className="font-display text-[15px] font-bold text-ink [overflow-wrap:anywhere]">{feature}</p>
                                    {detail && <p className="mt-1 text-sm leading-6 text-ink-soft">{detail}</p>}
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
            {/* Tuiles reliées par des filets (« Accès rapides » du site de l'Université). */}
            <div className="grid grid-cols-1 pl-px pt-px text-left min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {categories.map((category) => {
                    const Icon = domainIcon(category.name);
                    const count = category.documents_count;
                    return (
                        <Link
                            key={category.id}
                            to={`/recherche?category_id=${category.id}`}
                            className="group -ml-px -mt-px grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 border border-line bg-surface px-5 py-4 transition-colors hover:bg-indigo-50 focus-visible:bg-indigo-50"
                        >
                            <Icon className="h-5 w-5 text-brass" strokeWidth={1.8} aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block truncate font-display text-[15px] font-bold text-ink group-hover:text-brass-deep" title={category.name}>
                                    {category.name}
                                </span>
                                {count != null && (
                                    <span className="block text-xs tabular-nums text-ink-soft">
                                        {count} document{count > 1 ? "s" : ""}
                                    </span>
                                )}
                            </span>
                            <ArrowRight className="h-4 w-4 text-brass transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </Link>
                    );
                })}
            </div>
        </Shell>
    );
}

// Une publication dans son cadre blanc « tirage photo » : couverture pleine hauteur, fiche bleu nuit.
// Les cadres en retrait du carrousel ne sont pas atteignables au clavier (active = false).
function PublicationFrame({ document, active }) {
    const { typeCfg, authors } = docInfo(document);
    const summary = document.abstract ? stripHtml(document.abstract).trim() : "";
    const views = document.consultation_count ?? 0;
    const focus = active ? undefined : -1;
    const TypeIcon = typeCfg.icon;

    return (
        <article className="grid h-full overflow-hidden rounded-[2px] min-[480px]:grid-cols-[auto_minmax(0,1fr)]">
            {/* Couverture sur toute la hauteur du cadre (recadrée si besoin) ; sinon, icône du type. */}
            <Link
                to={`/documents/${document.slug}`}
                className="relative block h-56 overflow-hidden bg-indigo-600 min-[480px]:h-auto min-[480px]:w-40 lg:w-48"
                tabIndex={-1}
                aria-hidden="true"
            >
                {document.cover_url ? (
                    <img src={document.cover_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                        <TypeIcon className="h-12 w-12 text-on-primary-soft" strokeWidth={1.25} />
                    </span>
                )}
            </Link>
            <div className="flex min-w-0 flex-col bg-indigo-800 p-5 text-[#ffffff] sm:p-6 lg:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-on-primary-soft">
                    {[typeCfg.label, document.year].filter(Boolean).join(" · ")}
                </p>
                <h3 className="mt-2 line-clamp-2 font-display text-xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere] lg:text-2xl">
                    <Link to={`/documents/${document.slug}`} className="hover:underline" tabIndex={focus}>
                        {document.title}
                    </Link>
                </h3>
                <p className="mt-1.5 truncate text-sm text-on-primary-soft">
                    {[authors, document.library].filter(Boolean).join(" · ")}
                </p>
                {summary && <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#ffffff] [overflow-wrap:anywhere]">{summary}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-5 pt-5">
                    <Link
                        to={`/documents/${document.slug}`}
                        className="inline-flex items-center gap-3 border-b border-gold-soft pb-1.5 text-sm font-bold text-gold-soft hover:gap-4"
                        tabIndex={focus}
                    >
                        Consulter
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-on-primary-soft">
                        <Eye className="h-3.5 w-3.5" />
                        {views} consultation{views > 1 ? "s" : ""}
                    </span>
                </div>
            </div>
        </article>
    );
}

// Cadres sans bordure. Position d'un cadre dans le carrousel : au centre, en retrait à gauche / à droite, ou masqué.
// Sur mobile, seul le cadre central est affiché (dans le flux, hauteur libre).
const SLIDE_POSITIONS = {
    active: "z-20 sm:-translate-x-1/2 w-full sm:w-[400px] lg:w-[460px]",
    next: "z-10 max-sm:hidden sm:-translate-x-[5%] sm:w-[400px] lg:w-[460px] scale-[0.82] brightness-[0.65]",
    prev: "z-10 max-sm:hidden sm:-translate-x-[95%] sm:w-[400px] lg:w-[460px] scale-[0.82] brightness-[0.65]",
    hidden: "z-0 max-sm:hidden sm:-translate-x-1/2 sm:w-[400px] lg:w-[460px] scale-75 invisible pointer-events-none",
};

function slidePosition(i, current, count) {
    if (i === current) return "active";
    if (count > 1 && i === (current + 1) % count) return "next";
    if (count > 2 && i === (current - 1 + count) % count) return "prev";
    return "hidden";
}

const AUTOPLAY_DELAY = 2000;

const CAROUSEL_BUTTON =
    "inline-flex h-11 w-11 items-center justify-center rounded-sm border border-line bg-surface text-brass transition-colors hover:border-indigo-800 hover:bg-indigo-800 hover:text-[#ffffff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

/**
 * Dernières publications en carrousel : la publication courante au centre dans un cadre blanc,
 * les voisines en retrait derrière elle ; flèches à côté du titre et points de position dessous.
 */
function DocumentsSection({ section, preview }) {
    const response = usePublicData("documents");
    const documents = (response?.data || []).slice(0, section.content.limit || 6);
    const [current, setCurrent] = useState(0);
    const [paused, setPaused] = useState(false);
    const count = documents.length;

    // Défilement automatique : publication suivante toutes les deux secondes, en pause sous la souris ou au clavier.
    // Relancé après chaque changement (flèches, points), pour laisser le délai complet à chaque publication.
    useEffect(() => {
        if (count < 2 || paused) return undefined;
        const timer = setTimeout(() => setCurrent((value) => (value + 1) % count), AUTOPLAY_DELAY);
        return () => clearTimeout(timer);
    }, [count, paused, current]);

    if (!count) {
        return preview ? <PreviewNote section={section}>Documents récents : aucun document publié pour le moment.</PreviewNote> : null;
    }
    const index = current % count;
    const go = (step) => setCurrent((index + step + count) % count);

    const action = section.content.link_text ? (
        <Link
            to="/recherche"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-brass transition hover:text-brass-deep"
        >
            {section.content.link_text}
            <ArrowRight className="h-4 w-4" />
        </Link>
    ) : null;
    // Flèches : de part et d'autre des cadres (grand écran), autour des points (mobile).
    const arrow = (step, className) => (
        <button
            type="button"
            className={cx(CAROUSEL_BUTTON, className)}
            onClick={() => go(step)}
            aria-label={step < 0 ? "Publication précédente" : "Publication suivante"}
        >
            {step < 0 ? <ChevronLeft className="h-5 w-5" aria-hidden="true" /> : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
        </button>
    );
    const sideArrow = "absolute top-1/2 z-30 -translate-y-1/2 max-sm:hidden";

    return (
        <Shell section={section} spacing="py-10">
            <Heading section={section} icon={Sparkles} action={action} className="mb-6" />
            <div
                className="relative text-left sm:h-[340px] lg:h-[380px]"
                role="region"
                aria-roledescription="carrousel"
                aria-label="Dernières publications"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") go(-1);
                    if (event.key === "ArrowRight") go(1);
                }}
            >
                {documents.map((doc, i) => {
                    const position = slidePosition(i, index, count);
                    return (
                        <div
                            key={doc.slug}
                            className={cx(
                                "overflow-hidden rounded-sm transition-all duration-500 ease-in-out motion-reduce:transition-none",
                                "sm:absolute sm:left-1/2 sm:top-1/2 sm:h-full sm:-translate-y-1/2",
                                position === "active" ? "relative" : "absolute max-sm:inset-0",
                                SLIDE_POSITIONS[position],
                            )}
                            aria-hidden={position === "active" ? undefined : "true"}
                        >
                            <PublicationFrame document={doc} active={position === "active"} />
                            {(position === "prev" || position === "next") && (
                                // Cadre en retrait : un clic l'amène au centre.
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    className="absolute inset-0 z-10 cursor-pointer"
                                    onClick={() => setCurrent(i)}
                                    aria-label={`Afficher « ${doc.title} »`}
                                />
                            )}
                        </div>
                    );
                })}
                {count > 1 && arrow(-1, cx(sideArrow, "left-[max(0px,calc(50%_-_420px))] lg:left-[max(0px,calc(50%_-_480px))]"))}
                {count > 1 && arrow(1, cx(sideArrow, "right-[max(0px,calc(50%_-_420px))] lg:right-[max(0px,calc(50%_-_480px))]"))}
            </div>
            {count > 1 && (
                <div className="mt-5 flex items-center justify-center gap-2">
                    {arrow(-1, "mr-2 sm:hidden")}
                    <div className="flex items-center gap-2" role="tablist" aria-label="Position dans le carrousel">
                    {documents.map((doc, i) => (
                        <button
                            key={doc.slug}
                            type="button"
                            role="tab"
                            aria-selected={i === index}
                            aria-label={`Afficher la publication ${i + 1}`}
                            onClick={() => setCurrent(i)}
                            className={cx(
                                "h-2 rounded-full transition-all duration-300",
                                i === index ? "w-8 bg-gold" : "w-2 bg-line hover:bg-brass",
                            )}
                        />
                    ))}
                    </div>
                    {arrow(1, "ml-2 sm:hidden")}
                </div>
            )}
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
            {/* Grands chiffres séparés par des filets (rangée de chiffres clés du site UMG). */}
            <div className="grid border-t border-line sm:grid-cols-3">
                {items.map((item, index) => (
                    <div key={item.label} className={cx("py-5 sm:px-6", index > 0 && "border-t border-line sm:border-l sm:border-t-0", index === 0 && "sm:pl-0")}>
                        <p className="font-display text-4xl font-bold tabular-nums leading-none text-brass sm:text-[42px]">
                            {item.value ?? "—"}
                        </p>
                        <p className="mt-2 text-sm text-ink-soft">{item.label}</p>
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
                    className="max-h-[520px] w-full rounded-lg object-cover"
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
                    <div key={index} className="modern-card flex flex-col !border-t-2 !border-t-brass p-6">
                        {item.title && <h3 className="font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">{item.title}</h3>}
                        {item.text && <p className="mt-2 flex-1 text-sm leading-6 text-ink-soft [overflow-wrap:anywhere]">{item.text}</p>}
                        <SmartLink
                            to={item.link}
                            className="mt-5 inline-flex w-fit items-center gap-2 border-b border-brass pb-1 text-sm font-bold text-brass hover:text-brass-deep"
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
                                "mt-2 font-display tracking-tight [overflow-wrap:anywhere]",
                                TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-[28px]",
                                WEIGHTS[style.title_weight] ?? "font-bold",
                            )}
                        >
                            {c.title}
                        </h2>
                    )}
                    {c.description && (
                        <p className={cx("mt-2 max-w-2xl text-sm leading-6 text-ink-soft [overflow-wrap:anywhere]", centered && "mx-auto")}>
                            {c.description}
                        </p>
                    )}
                </div>

                {c.button_text && (
                    <SmartLink
                        to={c.button_link}
                        // Bouton doré par défaut ; couleur choisie dans l'éditeur : bouton plein à texte blanc.
                        className={cx(style.button_color ? "btn-primary" : "btn-accent", "max-w-full shrink-0")}
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
                className={cx("grid overflow-hidden rounded-lg text-white md:grid-cols-2", !style.bg_color && "bg-indigo-800")}
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
                                "font-display tracking-tight [overflow-wrap:anywhere]",
                                TITLE_SIZES[style.title_size] ?? "text-2xl sm:text-3xl",
                                WEIGHTS[style.title_weight] ?? "font-bold",
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
                                "mt-2 inline-flex w-fit max-w-full items-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition",
                                !style.button_color && "bg-gold text-umg-night hover:bg-gold-deep",
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
