import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Mail, UserRound } from "lucide-react";
import { api } from "../lib/api";

export default function TicketReceiptPage() {
    const { uuid } = useParams();

    const [ticket, setTicket] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!uuid) {
            setError("Cette demande n'existe pas.");
            return;
        }

        api.getAccountRequest(uuid)
            .then((data) => {
                /*
                 * Laravel peut renvoyer la demande sous plusieurs formes :
                 *
                 * { request: {...} }
                 * { request: { data: {...} } }
                 * { data: { request: {...} } }
                 * { data: {...} }
                 *
                 * On récupère la vraie demande quelle que soit la structure.
                 */
                const requestData =
                    data?.request?.data ??
                    data?.request ??
                    data?.data?.request?.data ??
                    data?.data?.request ??
                    data?.data ??
                    data;

                setTicket(requestData);
            })
            .catch((err) => {
                console.error("Erreur récupération demande :", err);
                setError("Cette demande n'existe pas.");
            });
    }, [uuid]);

    if (error) {
        return (
            <main className="min-h-screen bg-paper px-4 py-10">
                <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-5 text-center">
                    <h1 className="text-2xl font-bold text-ink">
                        Demande introuvable
                    </h1>

                    <p className="mt-3 text-sm text-ink-soft">{error}</p>

                    <Link
                        to="/"
                        className="mt-6 inline-flex rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white"
                    >
                        Retour à l'accueil
                    </Link>
                </div>
            </main>
        );
    }

    if (!ticket) {
        return (
            <main className="min-h-screen bg-paper px-4 py-10">
                <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-5 text-center">
                    <p className="text-sm text-ink-soft">
                        Chargement de votre demande...
                    </p>
                </div>
            </main>
        );
    }

    const roleLabels = {
        etudiant: "Étudiant",
        enseignant: "Enseignant",
        chercheur: "Chercheur",
        bibliothecaire: "Service Numérique",
        administrateur: "Administrateur",
    };

    const statusLabels = {
        pending: "En attente",
        approved: "Validée",
        validated: "Validée",
        rejected: "Rejetée",
        active: "Active",
        inactive: "Inactive",
    };

    const roleLabel = roleLabels[ticket.role] ?? ticket.role ?? "—";

    const statusLabel = statusLabels[ticket.status] ?? ticket.status ?? "—";

    /*
     * Prénom facultatif :
     *
     * first_name = "Jean"
     * last_name  = "Rakoto"
     * => Jean Rakoto
     *
     * first_name = ""
     * last_name  = "Rakoto"
     * => Rakoto
     */
    const fullName = [ticket.first_name, ticket.last_name]
        .filter(
            (value) =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== "",
        )
        .map((value) => String(value).trim())
        .join(" ");

    return (
        <main className="min-h-screen bg-paper px-4 py-8 md:px-6 md:py-12">
            <div className="mx-auto max-w-4xl">
                {/* EN-TÊTE */}
                <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-green-200 bg-green-50">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>

                    <h1 className="mt-5 text-2xl font-bold text-ink md:text-2xl">
                        Demande enregistrée
                    </h1>

                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-ink-soft md:text-base">
                        Votre demande a bien été envoyée. Conservez les
                        informations ci-dessous pour suivre votre demande.
                    </p>
                </div>

                {/* CARTE PRINCIPALE */}
                <div className="mt-8 rounded-2xl border border-line bg-white p-5 md:p-5">
                    {/* INFORMATIONS DE LA DEMANDE */}
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* N° DEMANDE */}
                        <div className="rounded-xl border border-line bg-paper p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                                N° de demande
                            </p>

                            <p className="mt-2 break-all text-sm font-bold text-ink">
                                {ticket.request_number ?? "—"}
                            </p>
                        </div>

                        {/* MATRICULE */}
                        <div className="rounded-xl border border-line bg-paper p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                                Numéro de compte
                            </p>

                            <p className="mt-2 break-all text-sm font-bold text-ink">
                                {ticket.matricule ??
                                    ticket.member_matricule ??
                                    ticket.matricule_member ??
                                    "—"}
                            </p>
                        </div>

                        {/* STATUT */}
                        <div className="rounded-xl border border-line bg-paper p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                                Statut
                            </p>

                            <p className="mt-2 text-sm font-bold text-amber-600">
                                {statusLabel}
                            </p>
                        </div>
                    </div>

                    {/* INFORMATIONS DU DEMANDEUR */}
                    <div className="mt-8">
                        <div className="flex items-center gap-2 border-b border-line pb-3">
                            <UserRound className="h-5 w-5 text-ink" />

                            <h2 className="text-lg font-bold text-ink">
                                Informations du demandeur
                            </h2>
                        </div>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            {/* RÔLE */}
                            <div>
                                <p className="text-sm font-semibold text-ink-soft">
                                    Rôle
                                </p>

                                <p className="mt-1 text-sm text-ink">
                                    {roleLabel}
                                </p>
                            </div>

                            {/* DEMANDEUR */}
                            <div>
                                <p className="text-sm font-semibold text-ink-soft">
                                    Demandeur
                                </p>

                                <p className="mt-1 text-sm text-ink">
                                    {fullName || "—"}
                                </p>
                            </div>

                            {/* EMAIL */}
                            <div>
                                <p className="text-sm font-semibold text-ink-soft">
                                    E-mail
                                </p>

                                <div className="mt-1 flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-ink-soft" />

                                    <p className="break-all text-sm text-ink">
                                        {ticket.email ?? "—"}
                                    </p>
                                </div>
                            </div>

                            {/* TÉLÉPHONE */}
                            {ticket.phone && (
                                <div>
                                    <p className="text-sm font-semibold text-ink-soft">
                                        Téléphone
                                    </p>

                                    <p className="mt-1 text-sm text-ink">
                                        {ticket.phone}
                                    </p>
                                </div>
                            )}

                            {/* ADRESSE */}
                            {ticket.address && (
                                <div>
                                    <p className="text-sm font-semibold text-ink-soft">
                                        Adresse
                                    </p>

                                    <p className="mt-1 text-sm text-ink">
                                        {ticket.address}
                                    </p>
                                </div>
                            )}

                            {/* ÉTABLISSEMENT */}
                            {ticket.school && (
                                <div>
                                    <p className="text-sm font-semibold text-ink-soft">
                                        Établissement
                                    </p>

                                    <p className="mt-1 text-sm text-ink">
                                        {ticket.school}
                                    </p>
                                </div>
                            )}

                            {/* FILIÈRE */}
                            {ticket.filiere && (
                                <div>
                                    <p className="text-sm font-semibold text-ink-soft">
                                        Filière
                                    </p>

                                    <p className="mt-1 text-sm text-ink">
                                        {ticket.filiere}
                                    </p>
                                </div>
                            )}

                            {/* NIVEAU */}
                            {ticket.niveau_detail && (
                                <div>
                                    <p className="text-sm font-semibold text-ink-soft">
                                        Niveau
                                    </p>

                                    <p className="mt-1 text-sm text-ink">
                                        {ticket.niveau_detail}
                                    </p>
                                </div>
                            )}

                            {/* FACULTÉ */}
                            {ticket.faculty && (
                                <div>
                                    <p className="text-sm font-semibold text-ink-soft">
                                        Faculté / Institut
                                    </p>

                                    <p className="mt-1 text-sm text-ink">
                                        {ticket.faculty}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PROCHAINES ÉTAPES */}
                    <div className="mt-8 rounded-xl border border-line bg-paper p-5">
                        <div className="flex items-start gap-3">
                            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink" />

                            <div>
                                <h2 className="text-base font-bold text-ink">
                                    Prochaines étapes
                                </h2>

                                <p className="mt-2 text-sm leading-6 text-ink-soft">
                                    Votre demande sera examinée par le service
                                    concerné. Vous recevrez un e-mail concernant
                                    la validation ou le rejet de votre demande.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* RETOUR */}
                    <div className="mt-8 flex justify-center">
                        <Link
                            to="/"
                            className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-paper"
                        >
                            Retour à l'accueil
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
