import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import LibraryCover from "../components/LibraryCover";

export default function CreateAccountSelectLibraryPage() {
    const [libraries, setLibraries] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getLibraries()
            .then(setLibraries)
            .catch(() =>
                setError("Impossible de charger la liste des bibliothèques."),
            );
    }, []);

    return (
        <div className="mx-auto max-w-3xl px-6 py-8 sm:py-10">
            <p className="text-xs uppercase tracking-[0.25em] text-brass font-semibold mb-3">
                Étape 1 sur 2
            </p>
            <h1 className="font-display text-3xl text-ink mb-3">
                Créer un compte
            </h1>
            <p className="text-ink-soft max-w-xl mb-10">
                Choisissez la bibliothèque auprès de laquelle vous souhaitez
                demander la création de votre compte.
            </p>

            {error && <p className="text-red-700">{error}</p>}

            <div className="grid sm:grid-cols-2 gap-4">
                {libraries.map((lib) => (
                    <Link
                        key={lib.id}
                        to={`/creer-un-compte/${lib.id}`}
                        className="group rounded-xl border border-line bg-paper p-5 hover:border-brass/60 hover:-translate-y-0.5 transition-all"
                    >
                        <LibraryCover library={lib} className="mb-4" />
                        <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-lg text-ink group-hover:text-brass-deep transition-colors">
                                {lib.name}
                            </p>
                            <ArrowRight
                                className="h-4 w-4 mt-1.5 flex-shrink-0 text-ink-soft/40 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
                                strokeWidth={1.5}
                            />
                        </div>
                        {lib.location && (
                            <p className="flex items-center gap-1.5 text-sm text-ink-soft mt-1">
                                <MapPin
                                    className="h-3.5 w-3.5 flex-shrink-0"
                                    strokeWidth={1.5}
                                />
                                {lib.location}
                            </p>
                        )}
                        {lib.opening_hours && (
                            <p className="flex items-center gap-1.5 text-xs text-brass mt-3 uppercase tracking-wide">
                                <Clock
                                    className="h-3.5 w-3.5 flex-shrink-0"
                                    strokeWidth={1.5}
                                />
                                {lib.opening_days
                                    ? `${lib.opening_days} . ${lib.opening_hours}`
                                    : lib.opening_hours}
                            </p>
                        )}
                    </Link>
                ))}
            </div>
        </div>
    );
}
