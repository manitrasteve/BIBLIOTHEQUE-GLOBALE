import {
    LayoutTemplate,
    Tags,
    FileText,
    Building2,
    BarChart3,
    AlignLeft,
    Image as ImageIcon,
    LayoutGrid,
    Megaphone,
    UserPlus,
} from "lucide-react";

/**
 * Types de sections de la page d'accueil et champs modifiables.
 * Doit rester aligné avec app/Support/HomepageSchema.php (le serveur refuse tout le reste).
 *
 * Genres de champ : text · textarea · bool · int · link · image · list · cards
 */

// Messages entre l'éditeur et l'aperçu intégré (iframe, même origine).
export const PREVIEW_MESSAGE = "homepage-preview";
export const PREVIEW_READY = "homepage-preview-ready";

export const DEFAULT_HERO_IMAGE = "/images/hero-student.png";

// Styles contrôlés proposés à l'administrateur (valeurs prédéfinies uniquement).
export const STYLE_OPTIONS = {
    align: [
        ["left", "Gauche"],
        ["center", "Centré"],
    ],
    title_size: [
        ["sm", "Petit"],
        ["md", "Moyen"],
        ["lg", "Grand"],
    ],
    title_weight: [
        ["normal", "Normal"],
        ["semibold", "Demi-gras"],
        ["bold", "Gras"],
        ["extrabold", "Très gras"],
    ],
    spacing: [
        ["sm", "Réduit"],
        ["md", "Normal"],
        ["lg", "Large"],
    ],
};

const TEXT_STYLES = ["align", "title_size", "title_weight", "spacing", "text_color", "bg_color"];

export const SECTION_TYPES = {
    hero: {
        label: "Hero (bandeau principal)",
        description: "Grand bandeau d'accueil : titre, recherche et image.",
        icon: LayoutTemplate,
        styles: ["align", "title_size", "title_weight", "text_color", "bg_color"],
        fields: [
            { name: "badge", kind: "text", label: "Badge", max: 120 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "highlight", kind: "text", label: "Mot mis en valeur dans le titre", max: 80, help: "Doit apparaître tel quel dans le titre." },
            { name: "description", kind: "textarea", label: "Description", max: 600 },
            { name: "show_search", kind: "bool", label: "Afficher la barre de recherche" },
            { name: "features", kind: "list", label: "Points forts", maxItems: 4, max: 40 },
            { name: "show_image", kind: "bool", label: "Afficher l'image (écrans larges)" },
            { name: "image", kind: "image", label: "Image", fallback: DEFAULT_HERO_IMAGE },
            { name: "image_alt", kind: "text", label: "Description de l'image (accessibilité)", max: 160 },
        ],
        defaults: {
            badge: "Bibliothèque Globale · Université de Mahajanga",
            title: "Lire, rechercher et analyser vos ressources.",
            highlight: "analyser",
            description:
                "Une bibliothèque numérique centralisée pour consulter en ligne les livres, mémoires, thèses et autres documents, puis interroger chaque document avec l'assistant IA.",
            show_search: true,
            features: ["Recherche", "Analyse IA", "Consultation sécurisée"],
            show_image: true,
            image: null,
            image_alt: "Étudiant consultant la bibliothèque numérique",
        },
    },
    categories: {
        label: "Domaines",
        description: "Liste des domaines (catégories) du catalogue.",
        icon: Tags,
        styles: TEXT_STYLES,
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
        ],
        defaults: { label: "Domaines", title: "Les domaines représentés" },
    },
    documents: {
        label: "Documents récents",
        description: "Les dernières publications du catalogue.",
        icon: FileText,
        styles: TEXT_STYLES,
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "link_text", kind: "text", label: "Texte du lien vers le catalogue", max: 60 },
            { name: "limit", kind: "int", label: "Nombre de documents", min: 2, max: 12 },
        ],
        defaults: { label: "Bibliothèque Globale", title: "Dernières publications", link_text: "Tout le catalogue", limit: 6 },
    },
    libraries: {
        label: "Bibliothèques",
        description: "Les bibliothèques du réseau avec leurs horaires.",
        icon: Building2,
        styles: TEXT_STYLES,
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "limit", kind: "int", label: "Nombre maximum", min: 1, max: 12 },
        ],
        defaults: { label: "Réseau", title: "Nos bibliothèques", limit: 6 },
    },
    stats: {
        label: "Statistiques",
        description: "Chiffres clés calculés automatiquement.",
        icon: BarChart3,
        styles: TEXT_STYLES,
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "show_documents", kind: "bool", label: "Nombre de documents" },
            { name: "show_libraries", kind: "bool", label: "Nombre de bibliothèques" },
            { name: "show_categories", kind: "bool", label: "Nombre de domaines" },
        ],
        defaults: { label: "En chiffres", title: "La bibliothèque aujourd'hui", show_documents: true, show_libraries: true, show_categories: true },
    },
    text: {
        label: "Texte",
        description: "Un titre et un paragraphe libre (texte simple).",
        icon: AlignLeft,
        styles: TEXT_STYLES,
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "body", kind: "textarea", label: "Texte", max: 5000, rows: 6 },
        ],
        defaults: { label: "", title: "Présentation", body: "" },
    },
    image: {
        label: "Image",
        description: "Une image pleine largeur avec légende.",
        icon: ImageIcon,
        styles: ["align", "spacing", "text_color", "bg_color"],
        fields: [
            { name: "image", kind: "image", label: "Image" },
            { name: "alt", kind: "text", label: "Description de l'image (accessibilité)", max: 160 },
            { name: "caption", kind: "text", label: "Légende", max: 300 },
        ],
        defaults: { image: null, alt: "", caption: "" },
    },
    cards: {
        label: "Cartes",
        description: "Jusqu'à 6 cartes avec titre, texte et lien.",
        icon: LayoutGrid,
        styles: TEXT_STYLES,
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "items", kind: "cards", label: "Cartes", maxItems: 6 },
        ],
        defaults: {
            label: "",
            title: "Services",
            items: [
                { title: "Consultation en ligne", text: "Lisez les documents directement dans le navigateur.", link: "" },
                { title: "Assistant IA", text: "Posez vos questions sur chaque document.", link: "" },
            ],
        },
    },
    cta: {
        label: "Appel à l'action",
        description: "Un encadré avec un bouton vers une page.",
        icon: Megaphone,
        styles: [...TEXT_STYLES, "button_color"],
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "description", kind: "textarea", label: "Description", max: 600 },
            { name: "button_text", kind: "text", label: "Texte du bouton", max: 60 },
            { name: "button_link", kind: "link", label: "Lien du bouton" },
        ],
        defaults: { label: "", title: "Explorez le catalogue", description: "", button_text: "Rechercher", button_link: "/recherche" },
    },
    signup: {
        label: "Inscription",
        description: "Invitation à créer un compte.",
        icon: UserPlus,
        styles: [...TEXT_STYLES, "button_color"],
        fields: [
            { name: "label", kind: "text", label: "Surtitre", max: 60 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "description", kind: "textarea", label: "Description", max: 600 },
            { name: "button_text", kind: "text", label: "Texte du bouton", max: 60 },
            { name: "button_link", kind: "link", label: "Lien du bouton" },
            { name: "guests_only", kind: "bool", label: "Afficher seulement aux visiteurs non connectés" },
        ],
        defaults: {
            label: "Accès membre",
            title: "S’inscrire",
            description: "La demande est examinée par le Service Numérique puis validée par l'administrateur.",
            button_text: "S’inscrire",
            button_link: "/creer-un-compte",
            guests_only: true,
        },
    },
};

export const EMPTY_STYLE = {
    align: null,
    title_size: null,
    title_weight: null,
    spacing: null,
    text_color: null,
    bg_color: null,
    button_color: null,
};

// Identifiant court sans crypto.randomUUID (indisponible hors HTTPS, ex. accès par IP locale).
function newId(type) {
    return `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createSection(type, id = newId(type)) {
    return {
        id,
        type,
        visible: true,
        content: structuredClone(SECTION_TYPES[type].defaults),
        style: { ...EMPTY_STYLE },
    };
}

// Page d'accueil d'origine : utilisée tant qu'aucune version n'est publiée.
export const DEFAULT_SECTIONS = [
    createSection("hero", "hero"),
    createSection("categories", "domaines"),
    createSection("documents", "publications"),
    createSection("signup", "inscription"),
];

// Titre court affiché dans la liste des sections de l'éditeur.
export function sectionSummary(section) {
    const c = section.content || {};
    return c.title || c.caption || c.alt || "";
}

// Lien sûr uniquement : interne (« /page ») ou http(s). Le serveur applique la même règle.
export function safeLink(value) {
    if (typeof value !== "string" || !value) return null;
    if (/^\/(?!\/)[^\s\\]*$/.test(value)) return { internal: true, href: value };
    if (/^https?:\/\/[^\s]+$/i.test(value)) return { internal: false, href: value };
    return null;
}

export function homepageImageUrl(path) {
    return path ? `/storage/${path}` : null;
}
