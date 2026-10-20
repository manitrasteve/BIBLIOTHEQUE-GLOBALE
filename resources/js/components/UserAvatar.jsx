import { useState } from "react";
import { UserRound } from "lucide-react";

// Photo de profil ronde d'un compte (listes Utilisateurs, Service Numérique) ; icône de personne
// si le compte n'a pas de photo ou si l'image ne se charge pas.
export default function UserAvatar({ user, size = "h-9 w-9" }) {
    const [failedUrl, setFailedUrl] = useState(null);
    const url = user?.photo_url;

    if (url && failedUrl !== url) {
        return (
            <img
                src={url}
                alt=""
                loading="lazy"
                onError={() => setFailedUrl(url)}
                className={`${size} shrink-0 rounded-full border border-line object-cover`}
            />
        );
    }

    return (
        <span className={`${size} grid shrink-0 place-items-center rounded-full border border-line bg-paper-dim text-ink-soft`} aria-hidden="true">
            <UserRound className="h-1/2 w-1/2" strokeWidth={1.75} />
        </span>
    );
}
