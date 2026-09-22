import { cn } from "../../lib/utils";
export function DropdownMenu({ children }) { return <div className="relative inline-block">{children}</div>; }
export function DropdownMenuTrigger({ children, ...props }) { return <span {...props}>{children}</span>; }
export function DropdownMenuContent({ className, children, ...props }) { return <div className={cn("absolute right-0 z-50 mt-1 min-w-40 rounded-md border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900", className)} {...props}>{children}</div>; }
export function DropdownMenuItem({ className, ...props }) { return <button type="button" className={cn("flex w-full items-center rounded px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800", className)} {...props} />; }
