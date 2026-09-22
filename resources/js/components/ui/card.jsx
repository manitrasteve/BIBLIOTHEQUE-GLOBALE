import { cn } from "../../lib/utils";

export function Card({ className, ...props }) {
 return <div className={cn("rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100", className)} {...props} />;
}
export function CardHeader({ className, ...props }) { return <div className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />; }
export function CardTitle({ className, ...props }) { return <h3 className={cn("text-sm font-semibold leading-none tracking-tight", className)} {...props} />; }
export function CardDescription({ className, ...props }) { return <p className={cn("text-xs text-slate-500 dark:text-slate-400", className)} {...props} />; }
export function CardContent({ className, ...props }) { return <div className={cn("p-4 pt-0", className)} {...props} />; }
export function CardFooter({ className, ...props }) { return <div className={cn("flex items-center p-4 pt-0", className)} {...props} />; }
