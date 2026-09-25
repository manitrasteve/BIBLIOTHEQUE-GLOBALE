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
} from "lucide-react";
import { api } from "../../lib/api";
import { DEFAULT_HERO_IMAGE, homepageImageUrl, safeLink } from "../../lib/homepage";
import SearchBar from "../SearchBar";
import DocumentCard from "../DocumentCard";
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
    categories: () => api.getCategories(),
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

function HeroSection({ section }) {
    const c = section.content;
    const style = section.style || {};
    const color = textColorOf(section);
    const centered = style.align === "center";
    const features = (c.features || []).filter(Boolean);

    return (
        <section className="w-full px-4 pt-6 sm:px-8 xl:px-10">
            <div
                className={cx(
                    "grid overflow-hidden rounded-[30px]",
                    !style.bg_color && "bg-indigo-600",
                    c.show_image && "lg:grid-cols-[1.05fr_.95fr]",
                )}
                style={style.bg_color ? { backgroundColor: style.bg_color } : undefined}
            >
                <div
                    className={cx(
                        "flex min-w-0 flex-col justify-center p-7 text-white sm:p-10 lg:p-12",
                        centered && "items-center text-center",
                    )}
                    style={color}
                >
                    {c.badge && (
                        <span className="badge-modern w-fit max-w-full bg-surface text-brass-deep">
                            <LibraryBig className="h-3.5 w-3.5 shrink-0" />
                            <span className="[overflow-wrap:anywhere]">{c.badge}</span>
                        </span>
                    )}
                    {c.title && (
                        <h1
                            className={cx(
                                "mt-6 font-display leading-[1.04] tracking-tight [overflow-wrap:anywhere]",
                                HERO_TITLE_SIZES[style.title_size] ?? HERO_TITLE_SIZES.md,
                                WEIGHTS[style.title_weight] ?? "font-extrabold",
                            )}
                        >
                            {withHighlight(c.title, c.highlight, color ? "underline decoration-4 underline-offset-8" : "text-on-primary-soft")}
                        </h1>
                    )}
                    {c.description && (
                        <p
                            className={cx("mt-5 max-w-2xl text-base leading-7 sm:text-lg [overflow-wrap:anywhere]", !color && "text-on-primary-soft")}
                            style={color}
                        >
                            {c.description}
                        </p>
                    )}
                    {c.show_search && (
                        <div className={cx("mt-7 w-full max-w-2xl rounded-2xl bg-surface p-2 text-left", centered && "mx-auto")}>
                            <SearchBar />
                        </div>
                    )}
                    {features.length > 0 && (
                        <div
                            className={cx(
                                "mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold",
                                !color && "text-on-primary-soft",
                                centered && "justify-center",
                            )}
                            style={color}
                        >
                            {features.map((feature, index) => {
                                const Icon = HERO_FEATURE_ICONS[index % HERO_FEATURE_ICONS.length];
                                return (
                                    <span key={index} className="inline-flex items-center gap-1.5">
                                        <Icon className="h-4 w-4" /> {feature}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
                {c.show_image && (
                    <div className="relative hidden min-h-[430px] bg-indigo-100 lg:block">
                        <img
                            src={homepageImageUrl(c.image) || DEFAULT_HERO_IMAGE}
                            alt={c.image_alt || ""}
                            fetchPriority="high"
                            decoding="async"
                            className="h-full w-full object-cover object-center"
                        />
                    </div>
                )}
            </div>
        </section>
    );
}

function CategoriesSection({ section, preview }) {
    const categories = usePublicData("categories") || [];
    const centered = section.style?.align === "center";

    if (!categories.length) {
        return preview ? <PreviewNote section={section}>Domaines : aucun domaine à afficher pour le moment.</PreviewNote> : null;
    }

    return (
        <Shell section={section} spacing="py-10">
            <Heading section={section} icon={BookOpen} />
            <div className={cx("flex flex-wrap gap-3", centered && "justify-center")}>
                {categories.map((category) => (
                    <Link
                        key={category.id}
                        to={`/recherche?category_id=${category.id}`}
                        className="rounded-full border border-slate-200 bg-surface px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-brass-deep"
                    >
                        {category.name}
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

function DocumentsSection({ section, isLocked, preview }) {
    const response = usePublicData("documents");
    const documents = (response?.data || []).slice(0, section.content.limit || 6);

    if (!documents.length) {
        return preview ? <PreviewNote section={section}>Documents récents : aucun document publié pour le moment.</PreviewNote> : null;
    }

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
            <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                {documents.map((doc) => (
                    <DocumentCard key={doc.slug} document={doc} variant="grid" isLocked={isLocked} />
                ))}
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
                        style={style.button_color ? { backgroundColor: style.button_color } : undefined}
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

function SignupSection({ section, user, preview }) {
    if (section.content.guests_only && user && !preview) return null;

    const note =
        preview && section.content.guests_only ? (
            <p className="mb-3 inline-block rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                Visible uniquement par les visiteurs non connectés
            </p>
        ) : null;

    return <CallToAction section={section} icon={UserPlus} note={note} />;
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
