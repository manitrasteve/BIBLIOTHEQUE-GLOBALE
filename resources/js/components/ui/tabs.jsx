import { cn } from "../../lib/utils";

export function Tabs({ className, ...props }) { return <div className={cn("w-full", className)} {...props} />; }
export function TabsList({ className, ...props }) { return <div className={cn("inline-flex h-9 items-center rounded-md bg-slate-100 p-1", className)} {...props} />; }
export function TabsTrigger({ className, active = false, ...props }) { return <button type="button" className={cn("inline-flex h-7 items-center justify-center rounded px-2.5 text-xs font-medium transition-colors", active ? "bg-surface text-slate-900" : "text-slate-500 hover:text-slate-900", className)} {...props} />; }
export function TabsContent({ className, ...props }) { return <div className={cn("mt-3", className)} {...props} />; }
