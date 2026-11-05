// Formules LaTeX des réponses de l'assistant : KaTeX pèse ~600 ko, il n'est donc chargé
// (avec sa feuille de style) que lorsqu'une réponse contient réellement une formule.
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export { remarkMath, rehypeKatex };
