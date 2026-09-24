import { cn } from "../../lib/utils";

export function Separator({ className, orientation = "horizontal", ...props }) {
 return <div role="separator" className={cn("shrink-0 bg-slate-200", orientation === "vertical" ? "h-full w-px" : "h-px w-full", className)} {...props} />;
}
