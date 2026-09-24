import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }) {
 return (
 <textarea
 className={cn(
 "min-h-20 w-full rounded-md border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400",
 "focus:border-brass focus:ring-2 focus:ring-brass/10",
 className,
 )}
 {...props}
 />
 );
}
