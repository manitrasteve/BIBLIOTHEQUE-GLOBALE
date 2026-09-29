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

// Bannière d'ouverture par défaut : logos des établissements de l'Université de Mahajanga (WebP,
// fond blanc), en diaporama tant qu'aucune image n'est téléversée dans l'éditeur de la page
// d'accueil ; texte de remplacement pour l'accessibilité.
export const DEFAULT_HERO_SLIDES = [
    { src: "/images/etablissements/isstm.webp", alt: "Logo de l'ISSTM, Institut Supérieur des Sciences et Technologies de Mahajanga" },
    { src: "/images/etablissements/iutam.webp", alt: "Logo de l'IUTAM, Institut Universitaire de Technologie et d'Agronomie de Mahajanga" },
    { src: "/images/etablissements/edsp.webp", alt: "Logo de l'EDSP, École de Droit et Science Politiques de l'Université de Mahajanga" },
    { src: "/images/etablissements/ecole-tourisme.webp", alt: "Logo de l'École de Tourisme" },
    { src: "/images/etablissements/iostm.webp", alt: "Logo de l'IOSTM, Institut d'Odonto-Stomatologie Tropicale de Madagascar" },
    { src: "/images/etablissements/iugm.webp", alt: "Logo de l'IUGM, Institut Universitaire de Gestion et de Management" },
    { src: "/images/etablissements/elci.webp", alt: "Logo de l'ELCI, École des Langues Commerciales Internationales" },
    { src: "/images/etablissements/fste.webp", alt: "Logo de la FSTE, Faculté des Sciences, de Technologies et de l'Environnement" },
    { src: "/images/etablissements/edgvm.webp", alt: "Logo de l'EDGVM, École Doctorale Génie du Vivant et Modélisation de l'Université de Mahajanga" },
    { src: "/images/etablissements/ens.webp", alt: "Logo de l'ENS, École Normale Supérieure de l'Université de Mahajanga" },
    { src: "/images/etablissements/ecole-veterinaire.webp", alt: "Logo de l'École de Vétérinaire de l'Université de Mahajanga" },
    { src: "/images/etablissements/eatp.webp", alt: "Logo de l'E.A.T.P, École des Arts et Techniques en Prothèse dentaires" },
    { src: "/images/etablissements/eden.webp", alt: "Logo de l'EDEN, École Doctorale Écosystèmes Naturels" },
    { src: "/images/etablissements/faculte-medecine.webp", alt: "Logo de la Faculté de Médecine de l'Université de Mahajanga" },
    { src: "/images/etablissements/ecole-pharmacie.webp", alt: "Logo de l'École de Pharmacie" },
];
// Logo de l'Université affiché en haut à gauche du diaporama, par-dessus chaque logo.
export const HERO_UNIVERSITY_LOGO = "/images/etablissements/umg.webp";
export const DEFAULT_HERO_IMAGE = DEFAULT_HERO_SLIDES[0].src;
export const DEFAULT_HERO_IMAGE_ALT = DEFAULT_HERO_SLIDES[0].alt;
// Photo de la salle de lecture accompagnant l'invitation à s'inscrire (WebP 1600×800).
export const SIGNUP_IMAGE = "/images/salle-lecture-large.webp";

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
        description: "Bannière d'ouverture, puis titre, recherche et points forts.",
        icon: LayoutTemplate,
        styles: ["align", "title_size", "title_weight", "text_color", "bg_color"],
        fields: [
            { name: "badge", kind: "text", label: "Badge", max: 120 },
            { name: "title", kind: "text", label: "Titre", max: 160 },
            { name: "highlight", kind: "text", label: "Mot mis en valeur dans le titre", max: 80, help: "Doit apparaître tel quel dans le titre." },
            { name: "description", kind: "textarea", label: "Description", max: 600 },
            { name: "show_search", kind: "bool", label: "Afficher la barre de recherche" },
            { name: "features", kind: "list", label: "Points forts", maxItems: 4, max: 40 },
            { name: "show_image", kind: "bool", label: "Afficher la bannière" },
            { name: "image", kind: "image", label: "Bannière (format paysage 16:9 conseillé)", fallback: DEFAULT_HERO_IMAGE },
            { name: "image_alt", kind: "text", label: "Description de la bannière (accessibilité)", max: 160, help: "Utilisée pour une bannière téléversée." },
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
            image_alt: "",
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
