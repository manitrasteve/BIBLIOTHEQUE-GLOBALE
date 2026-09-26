import { Skeleton } from "./Skeleton";

// Affiché pendant le téléchargement d'une page chargée à la demande (React.lazy).
export default function PageLoader() {
    return (
        <div role="status" aria-busy="true" className="w-full px-4 py-10 sm:px-8 xl:px-10">
            <span className="sr-only">Chargement de la page…</span>
            <Skeleton className="block h-4 w-32" />
            <Skeleton className="mt-3 block h-8 w-2/3 max-w-md" />
            <div className="mt-8 grid gap-3">
                <Skeleton className="block h-24 w-full" />
                <Skeleton className="block h-24 w-full" />
            </div>
        </div>
    );
}
