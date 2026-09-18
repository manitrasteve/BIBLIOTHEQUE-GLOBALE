import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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
    hr: () => <hr className="my-3 border-gray-200 dark:border-slate-600" />,
    blockquote: (props) => (
        <blockquote className="mb-2 border-l-4 border-gray-200 pl-3 italic dark:border-slate-600" {...props} />
    ),
    code: (props) => (
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] dark:bg-slate-700" {...props} />
    ),
    a: (props) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer noopener" {...props} />,
    table: (props) => (
        <div className="mb-2 max-w-full overflow-x-auto">
            <table className="min-w-full border-collapse text-xs sm:text-sm" {...props} />
        </div>
    ),
    th: (props) => (
        <th className="border border-gray-200 bg-gray-100 px-2 py-1 text-left font-semibold dark:border-slate-600 dark:bg-slate-700" {...props} />
    ),
    td: (props) => <td className="border border-gray-200 px-2 py-1 align-top dark:border-slate-600" {...props} />,
};

export default function AiMarkdown({ children }) {
    return (
        <div className="ai-md break-words text-sm leading-relaxed">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={components}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
