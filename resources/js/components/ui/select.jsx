import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }) {
 return (
 <select
 className={cn(
 "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none",
 "focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
 className,
 )}
 {...props}
 >
 {children}
 </select>
 );
}
