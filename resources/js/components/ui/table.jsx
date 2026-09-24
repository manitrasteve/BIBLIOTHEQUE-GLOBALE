import { cn } from "../../lib/utils";

export function Table({ className, ...props }) { return <div className="w-full overflow-auto"><table className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>; }
export function TableHeader({ className, ...props }) { return <thead className={cn("border-b border-slate-200", className)} {...props} />; }
export function TableBody({ className, ...props }) { return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />; }
export function TableFooter({ className, ...props }) { return <tfoot className={cn("border-t bg-slate-50 font-medium", className)} {...props} />; }
export function TableRow({ className, ...props }) { return <tr className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50/70", className)} {...props} />; }
export function TableHead({ className, ...props }) { return <th className={cn("h-9 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-slate-500", className)} {...props} />; }
export function TableCell({ className, ...props }) { return <td className={cn("p-3 align-middle", className)} {...props} />; }
export function TableCaption({ className, ...props }) { return <caption className={cn("mt-3 text-xs text-slate-500", className)} {...props} />; }
