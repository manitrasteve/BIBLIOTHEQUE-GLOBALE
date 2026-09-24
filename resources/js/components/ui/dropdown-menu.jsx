import { cn } from "../../lib/utils";
export function DropdownMenu({ children }) { return <div className="relative inline-block">{children}</div>; }
export function DropdownMenuTrigger({ children, ...props }) { return <span {...props}>{children}</span>; }
export function DropdownMenuContent({ className, children, ...props }) { return <div className={cn("absolute right-0 z-50 mt-1 min-w-40 rounded-md border border-slate-200 bg-surface p-1 text-sm", className)} {...props}>{children}</div>; }
export function DropdownMenuItem({ className, ...props }) { return <button type="button" className={cn("flex w-full items-center rounded px-2.5 py-1.5 text-left text-xs hover:bg-slate-100", className)} {...props} />; }
