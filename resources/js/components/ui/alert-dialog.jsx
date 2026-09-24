import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

export function AlertDialog({ open, onOpenChange, children }) { return <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>; }
export const AlertDialogContent = DialogContent;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogTitle = DialogTitle;
export const AlertDialogDescription = DialogDescription;
export const AlertDialogFooter = DialogFooter;
export function AlertDialogAction(props) { return <button type="button" className="inline-flex h-9 items-center justify-center rounded-md bg-[#1f3a5f] px-3 text-sm font-semibold text-white hover:bg-[#162a45]" {...props} />; }
export function AlertDialogCancel(props) { return <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" {...props} />; }
