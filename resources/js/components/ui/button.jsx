import { cn } from "../../lib/utils";

const variants = {
 default: "bg-indigo-600 text-white hover:bg-indigo-700",
 secondary: "border border-slate-200 bg-surface text-slate-800 hover:border-brass hover:bg-slate-50",
 outline: "border border-slate-200 bg-transparent text-slate-800 hover:bg-slate-50",
 ghost: "text-slate-700 hover:bg-slate-100",
 destructive: "bg-red-600 text-white hover:bg-red-500",
 link: "text-brass underline-offset-4 hover:underline",
};

const sizes = {
 default: "h-9 px-3 text-sm",
 sm: "h-8 rounded-md px-2.5 text-xs",
 lg: "h-10 rounded-md px-4 text-sm",
 icon: "h-9 w-9",
};

export function Button({ className, variant = "default", size = "default", type = "button", ...props }) {
 return (
 <button
 type={type}
 className={cn(
 "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
 "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200",
 variants[variant] || variants.default,
 sizes[size] || sizes.default,
 className,
 )}
 {...props}
 />
 );
}
