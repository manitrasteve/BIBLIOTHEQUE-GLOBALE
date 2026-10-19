import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getDocAssistant, subscribeDocAssistant } from "../lib/docAssistant";

// Messages de la bulle selon la rubrique ouverte (chemin après le préfixe de l'espace).
// L'assistant de gestion répond à partir du journal des actions (qui a fait quoi, quand) :
// chaque message propose une question d'historique liée à la rubrique.
// La clé la plus précise l'emporte : « documents/nouveau » avant « documents ».
const COMMON_MESSAGES = {
    statistiques: "Besoin de savoir combien de documents ont été ajoutés ou publiés, et quand ?",
    documents: "Besoin de savoir qui a ajouté, modifié ou publié un document ?",
    "documents/nouveau": "Besoin de savoir si ce document a déjà été ajouté, et par qui ?",
    "documents/importer": "Besoin de savoir quels documents ont déjà été importés, et quand ?",
    bibliotheques: "Besoin de savoir qui a créé ou modifié une bibliothèque ?",
    popularite: "Besoin de savoir qui a consulté un document, et quand ?",
    avis: "Besoin de connaître l'activité récente des membres ? Demandez-moi.",
    signalements: "Besoin de retrouver l'historique d'un document signalé ?",
    messages: "Besoin de retrouver une action passée avant de répondre ?",
    activites: "Besoin de savoir ce que vous avez fait aujourd'hui ? Demandez-moi votre historique.",
    corbeille: "Besoin de savoir qui a supprimé un document, et quand ?",
    notifications: "Besoin de savoir ce qui s'est passé récemment ? Demandez-moi l'historique.",
};

// Assistant de chaque espace de gestion. Il n'est proposé qu'à l'intérieur de cet espace
// (Administration, Gestion) : dans l'espace membre (profil, catalogue…), le robot n'apparaît
// que sur une fiche document et ouvre alors l'assistant du document.
const SPACE_ASSISTANTS = {
    administrateur: {
        prefix: "/administrateur",
        to: "/administrateur/assistant",
        message: "Besoin de savoir qui a fait quoi sur la plateforme ? Demandez-moi l'historique.",
        messages: {
            ...COMMON_MESSAGES,
            comptes: "Besoin de savoir qui a validé ou créé un compte, et quand ?",
            utilisateurs: "Besoin de savoir quand un compte a été créé ou modifié ?",
            bibliothecaires: "Besoin de savoir ce qu'a fait un bibliothécaire, et quand ?",
            permissions: "Besoin de savoir qui a modifié un compte, et quand ?",
            discussions: "Besoin de vérifier une action d'un bibliothécaire avant de lui répondre ?",
            historique: "Besoin de retrouver une action précise ? Dites-moi qui, quoi ou quand.",
            parametres: "Besoin de savoir ce qui a changé récemment sur la plateforme ?",
        },
    },
    bibliothecaire: {
        prefix: "/bibliothecaire",
        to: "/bibliothecaire/assistant",
        message: "Besoin de savoir qui a fait quoi dans votre bibliothèque ? Demandez-moi l'historique.",
        messages: {
            ...COMMON_MESSAGES,
            "tableau-de-bord": "Besoin de savoir qui a fait quoi dans votre bibliothèque ? Demandez-moi l'historique.",
            catalogue: "Besoin de savoir quand un document a été ajouté, et par qui ?",
            "tickets-comptes": "Besoin de savoir qui a traité une demande de compte, et quand ?",
            "creer-demande-compte": "Besoin de savoir quels comptes ont été créés récemment ?",
            discussions: "Besoin de retrouver une action passée avant d'écrire à l'administrateur ?",
        },
    },
};

function spaceMessage(space, pathname) {
    const section = pathname.slice(space.prefix.length + 1).replace(/\/+$/, "");
    const key = Object.keys(space.messages)
        .filter((k) => section === k || section.startsWith(`${k}/`))
        .sort((x, y) => y.length - x.length)[0];
    return key ? space.messages[key] : space.message;
}

// Fiche document : le robot est visible pendant la lecture (onglet « Lecture »).
const DOC_MESSAGE = "Besoin d'aide pour votre lecture ? Je peux résumer ou expliquer ce document.";
const BUBBLE_DELAY_MS = 8000;

function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Le robot (variante « Néon ») : tête laquée, visière noire, yeux souriants, casque audio,
// anneau sur la poitrine, main qui salue, socle holographique.
function RobotSvg({ lookRef }) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const shell = `url(#${id}s)`;
    const hand = `url(#${id}h)`;
    const glow = `url(#${id}f)`;
    const G = "#1e8cff";
    const E = "#5fd0ff";

    const finger = (x, y, h, a) => (
        <rect x={x} y={y} width="3.4" height={h} rx="1.7" transform={`rotate(${a} ${x + 1.7} ${y + h})`} fill={hand} />
    );

    return (
        <svg className="ai-robot__svg" viewBox="0 0 125 128" aria-hidden="true">
            <defs>
                <radialGradient id={`${id}s`} cx=".34" cy=".28" r=".85">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset=".55" stopColor="#eef1fa" />
                    <stop offset="1" stopColor="#b8c1db" />
                </radialGradient>
                <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#1b2140" />
                    <stop offset="1" stopColor="#03050f" />
                </linearGradient>
                <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4a5070" />
                    <stop offset="1" stopColor="#151a30" />
                </linearGradient>
                <radialGradient id={`${id}p`}>
                    <stop offset="0" stopColor={G} stopOpacity=".55" />
                    <stop offset="1" stopColor={G} stopOpacity="0" />
                </radialGradient>
                <filter id={`${id}f`} x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="1.4" result="b" />
                    <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Socle holographique */}
            <g filter={glow}>
                <ellipse cx="63" cy="118" rx="22" ry="5" fill={`url(#${id}p)`} />
                <ellipse cx="63" cy="118" rx="16" ry="3.4" fill="none" stroke={G} strokeWidth="1.3" />
                <ellipse className="ai-robot__ripple" cx="63" cy="118" rx="16" ry="3.4" fill="none" stroke={G} strokeWidth="1" />
                <ellipse cx="63" cy="118" rx="9" ry="1.9" fill="none" stroke={G} strokeWidth=".9" opacity=".7" />
            </g>

            <g className="ai-robot__float">
                {/* Bras gauche (pendant) */}
                <g className="ai-robot__arm">
                    <rect x="31" y="78" width="11" height="29" rx="5.5" transform="rotate(22 36.5 80)" fill={shell} />
                    <rect x="31.5" y="95" width="1.8" height="7" rx=".9" transform="rotate(22 36.5 80)" fill={G} filter={glow} />
                </g>

                {/* Corps */}
                <path d="M64 71 C78 71 86 80 85 92 C84 103 75 110 64 110 C53 110 44 103 43 92 C42 80 50 71 64 71 Z" fill={shell} />
                <path d="M50 99 Q56 107 66 108" stroke={G} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".7" filter={glow} />
                <path d="M50 80 Q47 88 49 96" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".9" />
                <ellipse cx="45.5" cy="81" rx="3.4" ry="5.5" fill="#151a30" />
                <ellipse cx="83" cy="81" rx="3.4" ry="5.5" fill="#151a30" />
                <circle cx="67" cy="90" r="6.6" fill="#0b1024" />
                <circle className="ai-robot__core" cx="67" cy="90" r="4.4" fill="none" stroke={G} strokeWidth="1.9" filter={glow} />

                {/* Bras droit qui salue (pivot à l'épaule) et main (pivot au poignet) */}
                <g className="ai-robot__wave">
                    <path d="M83 86 Q90 90 97 84 L104 74" stroke={shell} strokeWidth="10" fill="none" strokeLinecap="round" />
                    <path d="M88 87 Q95 88 99 81" stroke={shell} strokeWidth="10" fill="none" strokeLinecap="round" />
                    <rect x="102.5" y="75" width="1.6" height="6" rx=".8" transform="rotate(32 103 78)" fill={G} filter={glow} />
                    <g className="ai-robot__hand">
                        <rect x="100" y="66" width="9" height="5" rx="2" transform="rotate(25 104 68)" fill="#151a30" />
                        <rect x="101" y="56" width="12" height="11" rx="4.5" transform="rotate(14 107 62)" fill={hand} />
                        {finger(101.5, 47.5, 9, -8)}
                        {finger(105.2, 46, 10, 2)}
                        {finger(108.8, 47, 9.5, 10)}
                        {finger(112, 50, 8, 20)}
                        <rect x="99.5" y="57" width="3.6" height="8.5" rx="1.8" transform="rotate(-38 101.3 65.5)" fill={hand} />
                    </g>
                </g>

                {/* Cou */}
                <rect x="55" y="66" width="16" height="8" rx="3" fill="#151a30" />

                {/* Tête */}
                <ellipse cx="94" cy="45" rx="4" ry="10" fill="#151a30" />
                <ellipse cx="95.5" cy="45" rx="2" ry="7" fill={G} filter={glow} />
                <rect x="30" y="17" width="66" height="54" rx="27" fill={shell} />
                <path d="M40 27 Q50 18 64 17" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" />
                <rect x="54" y="17.5" width="20" height="6" rx="3" fill="#151a30" />
                <path d="M56 18.5 H62" stroke={G} strokeWidth="1.2" strokeLinecap="round" filter={glow} />
                <rect x="41" y="27.5" width="51" height="35" rx="13.5" fill="#20263f" />
                <rect x="42.5" y="29" width="48" height="32" rx="12.5" fill={`url(#${id}v)`} />
                <path d="M48 33 Q56 30.5 70 31" stroke="#ffffff" strokeOpacity=".22" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                <g ref={lookRef}>
                    <g filter={glow}>
                        <path className="ai-robot__eye" d="M50 51.5 A6.5 6.5 0 0 1 63 51.5" stroke={E} strokeWidth="4.2" fill="none" strokeLinecap="round" />
                        <path className="ai-robot__eye" d="M71 51.5 A6.5 6.5 0 0 1 84 51.5" stroke={E} strokeWidth="4.2" fill="none" strokeLinecap="round" />
                    </g>
                </g>

                {/* Écouteur gauche (au premier plan) */}
                <ellipse cx="33.5" cy="47" rx="5" ry="12.5" fill="#151a30" />
                <ellipse cx="29.5" cy="47" rx="6.4" ry="11.8" fill={shell} />
                <ellipse cx="28.6" cy="47" rx="4.6" ry="9" fill="none" stroke={G} strokeWidth="1.8" filter={glow} />
                <ellipse cx="28.6" cy="47" rx="2.9" ry="6.6" fill="#0b1024" />
            </g>
        </svg>
    );
}

// Robot flottant : raccourci vers l'assistant IA de la page (fiche document) ou de l'espace
// de gestion où l'on se trouve (Administration, Gestion). Masquable depuis Mon profil › Préférences.
export default function FloatingAssistant() {
    const { user } = useAuth();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const docAssistant = useSyncExternalStore(subscribeDocAssistant, getDocAssistant);
    const [bubbleOpen, setBubbleOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const lookRef = useRef(null);
    const buttonRef = useRef(null);

    const roleSpace = SPACE_ASSISTANTS[user?.role];
    const space = roleSpace && pathname.startsWith(roleSpace.prefix) ? roleSpace : null;
    // Sur une fiche document lisible, le robot ouvre l'assistant du document ; ailleurs, celui de l'espace.
    let target = null;
    if (docAssistant) target = { kind: "doc", message: DOC_MESSAGE, hidden: docAssistant.active };
    else if (space) target = { kind: "space", message: spaceMessage(space, pathname), hidden: pathname.startsWith(space.to) };

    const visible = Boolean(user && user.show_ai_robot !== false && target && !target.hidden);
    // La bulle réapparaît à chaque changement de rubrique, avec le message adapté.
    const bubbleKey = target ? `${pathname}|${target.message}` : null;
    const side = user?.ai_robot_position === "left" ? "left" : "right";

    useEffect(() => {
        if (!visible) {
            setBubbleOpen(false);
            return undefined;
        }
        setBubbleOpen(true);
        const timer = setTimeout(() => setBubbleOpen(false), BUBBLE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [visible, bubbleKey]);

    // Les yeux suivent le curseur.
    useEffect(() => {
        if (!visible || prefersReducedMotion()) return undefined;
        let frame = 0;

        function follow(event) {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const eyes = lookRef.current;
                const box = buttonRef.current?.getBoundingClientRect();
                if (!eyes || !box) return;
                const dx = Math.max(-3, Math.min(3, (event.clientX - (box.left + box.width / 2)) / 60));
                const dy = Math.max(-2, Math.min(2, (event.clientY - (box.top + box.height * 0.4)) / 80));
                eyes.setAttribute("transform", `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
            });
        }

        window.addEventListener("pointermove", follow, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("pointermove", follow);
        };
    }, [visible]);

    if (!visible) return null;

    function closeBubble() {
        setBubbleOpen(false);
    }

    function openAssistant() {
        closeBubble();

        if (target.kind === "doc") {
            docAssistant.open();
            return;
        }

        if (prefersReducedMotion()) {
            navigate(space.to);
            return;
        }

        setLeaving(true);
        setTimeout(() => {
            setLeaving(false);
            navigate(space.to);
        }, 380);
    }

    return (
        <div className={`ai-robot ai-robot--${side} ${leaving ? "ai-robot--leaving" : ""} print:hidden`}>
            <button
                ref={buttonRef}
                type="button"
                className="ai-robot__button"
                aria-label="Ouvrir l'assistant IA"
                title="Assistant IA"
                onClick={openAssistant}
            >
                <RobotSvg lookRef={lookRef} />
            </button>

            {bubbleOpen && (
                <div key={bubbleKey} className="ai-robot__bubble" role="status">
                    <span className="ai-robot__who">Assistant IA</span>
                    {target.message}
                    <button type="button" className="ai-robot__close" aria-label="Fermer la bulle" onClick={closeBubble}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
}
