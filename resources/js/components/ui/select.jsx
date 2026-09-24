import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }) {
 return (
 <select
 className={cn(
 "flex h-9 w-full rounded-md border border-slate-200 bg-surface px-3 py-1.5 text-sm text-slate-900 outline-none",
 "focus:border-brass focus:ring-2 focus:ring-brass/10",
 className,
 )}
 {...props}
 >
 {children}
 </select>
 );
}
