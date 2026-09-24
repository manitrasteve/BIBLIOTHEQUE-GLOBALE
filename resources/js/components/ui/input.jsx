import { cn } from "../../lib/utils";

export function Input({ className, type = "text", ...props }) {
 return (
 <input
 type={type}
 className={cn(
 "flex h-9 w-full rounded-md border border-slate-200 bg-surface px-3 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400",
 "focus:border-brass focus:ring-2 focus:ring-brass/10 disabled:cursor-not-allowed disabled:opacity-50",
 className,
 )}
 {...props}
 />
 );
}
