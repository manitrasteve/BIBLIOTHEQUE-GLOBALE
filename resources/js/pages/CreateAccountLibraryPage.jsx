import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import LibraryCover from "../components/LibraryCover";

export default function CreateAccountLibraryPage() {
    const { libraryId } = useParams();
    const navigate = useNavigate();
    const [library, setLibrary] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getLibrary(libraryId)
            .then(setLibrary)
            .catch(() => setError("Cette bibliothèque est introuvable."));
    }, [libraryId]);

    if (error) {
        return (
            <div className="mx-auto max-w-2xl px-6 py-16 text-center">
                <p className="text-red-700">{error}</p>
                <Link to="/creer-un-compte" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brass-deep">
                    <ArrowLeft className="h-4 w-4" /> Retour aux bibliothèques
                </Link>
            </div>
        );
    }

    if (!library) {
        return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-ink-soft">Chargement…</div>;
    }

    return (
        <div className="mx-auto max-w-3xl px-6 py-8 sm:py-10">
            <button type="button" onClick={() => navigate("/creer-un-compte")} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-brass-deep">
                <ArrowLeft className="h-4 w-4" /> Choisir une autre bibliothèque
            </button>

            <div className="rounded-xl border border-line bg-paper p-6 sm:p-10">
                <LibraryCover library={library} className="mb-6" />
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-brass">Bibliothèque sélectionnée</p>
                <h1 className="font-display text-3xl text-ink">{library.name}</h1>
                {library.description && <p className="mt-5 leading-7 text-ink-soft">{library.description}</p>}

                <div className="mt-8 grid gap-4 border-t border-line pt-6 text-sm text-ink-soft sm:grid-cols-2">
                    <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 flex-none text-brass" />{library.address || library.location || "Adresse non renseignée"}</p>
                    <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-none text-brass" />+261 32 42 083 62</p>
                </div>

                <Link to={`/creer-un-compte/${library.id}/demande`} className="btn-primary mt-8 inline-flex">
                    <UserPlus className="h-4 w-4" /> Demande de création de compte
                </Link>
            </div>
        </div>
    );
}