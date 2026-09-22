export function Tooltip({ children }) { return children; }
export function TooltipTrigger({ children, ...props }) { return <span {...props}>{children}</span>; }
export function TooltipContent({ children, ...props }) { return <span role="tooltip" {...props}>{children}</span>; }
export function TooltipProvider({ children }) { return children; }
