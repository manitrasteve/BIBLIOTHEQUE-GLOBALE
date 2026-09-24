import { cn } from "../../lib/utils";

const variants = {
 default: "border-transparent bg-indigo-600 text-white",
 secondary: "border-transparent bg-slate-100 text-slate-700",
 outline: "border-slate-200 text-slate-700",
 destructive: "border-transparent bg-red-100 text-red-700",
};

export function Badge({ className, variant = "default", ...props }) {
 return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", variants[variant] || variants.default, className)} {...props} />;
}
