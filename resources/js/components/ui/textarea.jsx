import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }) {
 return (
 <textarea
 className={cn(
 "min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400",
 "focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
 className,
 )}
 {...props}
 />
 );
}
