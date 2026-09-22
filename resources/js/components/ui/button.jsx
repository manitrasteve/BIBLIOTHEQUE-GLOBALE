import { cn } from "../../lib/utils";

const variants = {
 default: "bg-[#1f3a5f] text-white hover:bg-[#162a45]",
 secondary: "border border-slate-200 bg-white text-slate-800 hover:border-[#1f3a5f] hover:bg-slate-50",
 outline: "border border-slate-200 bg-transparent text-slate-800 hover:bg-slate-50",
 ghost: "text-slate-700 hover:bg-slate-100",
 destructive: "bg-red-600 text-white hover:bg-red-700",
 link: "text-[#1f3a5f] underline-offset-4 hover:underline",
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
 "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f3a5f]/30",
 variants[variant] || variants.default,
 sizes[size] || sizes.default,
 className,
 )}
 {...props}
 />
 );
}
