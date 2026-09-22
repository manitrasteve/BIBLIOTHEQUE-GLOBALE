function cn(...classes) { return classes.filter(Boolean).join(" "); }

export function Skeleton({ className = "", label = "" }) {
    return <span aria-hidden="true" className={cn("skeleton", className)}>{label && <span className="sr-only">{label}</span>}</span>;
}

export function SkeletonText({ lines = 3, className = "" }) {
    return <div aria-hidden="true" className={cn("space-y-2", className)}>{Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={cn("block h-3", index === lines - 1 ? "w-2/3" : "w-full")} />)}</div>;
}

export function SkeletonDocumentCard({ count = 4 }) {
    return <div role="status" aria-busy="true" aria-label="Chargement des documents" className="grid gap-4 sm:grid-cols-2">{Array.from({ length: count }, (_, index) => <div key={index} className="rounded-xl border border-line bg-paper p-4"><Skeleton className="block aspect-[16/8] w-full rounded-lg" /><div className="mt-4"><Skeleton className="block h-5 w-5/6" /><SkeletonText lines={2} className="mt-3" /><Skeleton className="mt-4 block h-7 w-24 rounded-full" /></div></div>)}</div>;
}

export function SkeletonTable({ columns = 5, rows = 5 }) {
    return <tbody aria-busy="true">{Array.from({ length: rows }, (_, row) => <tr key={row} className="border-t border-slate-100">{Array.from({ length: columns }, (_, column) => <td key={column} className="px-4 py-4"><Skeleton className="block h-4 w-full max-w-32" /></td>)}</tr>)}</tbody>;
}

export function SkeletonList({ count = 4 }) {
    return <div role="status" aria-busy="true" aria-label="Chargement du contenu" className="space-y-3">{Array.from({ length: count }, (_, index) => <div key={index} className="flex gap-3 rounded-xl border border-line bg-paper p-4"><Skeleton className="h-10 w-10 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="block h-4 w-2/5" /><SkeletonText lines={2} className="mt-3" /></div></div>)}</div>;
}

export function SkeletonDashboard() {
    return <div role="status" aria-busy="true" aria-label="Chargement du tableau de bord"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5"><Skeleton className="block h-3 w-2/3" /><Skeleton className="mt-4 block h-8 w-1/2" /></div>)}</div><SkeletonList count={3} className="mt-6" /></div>;
}

export function SkeletonProfile() {
    return <div role="status" aria-busy="true" aria-label="Chargement du profil" className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-4"><Skeleton className="h-20 w-20 rounded-full" /><div className="flex-1"><Skeleton className="block h-6 w-1/3" /><Skeleton className="mt-3 block h-4 w-1/2" /></div></div><div className="mt-7 grid gap-4 md:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton className="block h-3 w-1/3" /><Skeleton className="mt-2 block h-10 w-full rounded-xl" /></div>)}</div></div>;
}

export function SkeletonDocumentDetail() {
    return <div role="status" aria-busy="true" aria-label="Chargement du document" className="w-full px-4 py-7"><div className="flex flex-col gap-5 xl:flex-row"><div className="rounded-xl border border-line bg-paper p-4 xl:w-1/3"><div className="flex gap-4"><Skeleton className="h-40 w-28 rounded-lg" /><div className="flex-1"><Skeleton className="block h-4 w-1/3" /><Skeleton className="mt-3 block h-6 w-full" /><SkeletonText lines={3} className="mt-5" /></div></div></div><div className="flex-1 rounded-xl border border-line bg-paper p-5"><Skeleton className="block h-7 w-2/3" /><SkeletonText lines={6} className="mt-5" /><Skeleton className="mt-6 block h-10 w-36 rounded-xl" /></div></div></div>;
}

export function SkeletonPermissions() {
    return <div role="status" aria-busy="true" aria-label="Chargement des permissions" className="grid gap-6 lg:grid-cols-[280px_1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-4"><Skeleton className="block h-10 w-full rounded-xl" /><SkeletonList count={4} className="mt-4" /></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><Skeleton className="block h-7 w-1/3" /><SkeletonText lines={2} className="mt-4" /><div className="mt-6 space-y-4">{Array.from({ length: 3 }, (_, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><Skeleton className="block h-4 w-1/4" /><SkeletonText lines={3} className="mt-4" /></div>)}</div></div></div>;
}
