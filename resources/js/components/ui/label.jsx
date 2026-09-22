import { cn } from "../../lib/utils";

export function Label({ className, ...props }) {
 return <label className={cn("text-xs font-semibold leading-none text-slate-700 dark:text-slate-200", className)} {...props} />;
}
