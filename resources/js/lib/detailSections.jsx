// Construit les sections affichées dans la fenêtre « Voir » à partir des données
// réellement enregistrées. Aucun mot de passe, jeton ou secret n'est exposé ici.

import { stripHtml } from "./utils";

const ROLES = {
    etudiant: "Étudiant",
    enseignant: "Enseignant",
    chercheur: "Chercheur",
    bibliothecaire: "Bibliothécaire",
    administrateur: "Administrateur",
};
const GENDERS = { masculin: "Masculin", feminin: "Féminin" };

export function formatDate(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

export function formatDateTime(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString("fr-FR");
}

const level = (row) => [row.niveau_type, row.niveau_detail].filter(Boolean).join(" · ") || null;

// Identité, contact et profil : champs communs aux comptes et aux demandes.
function personSections(row) {
    return [
        {
            title: "Identité",
            fields: [
                ["Nom", row.last_name],
                ["Prénom", row.first_name],
                ["Genre", GENDERS[row.gender] || row.gender],
                ["Date de naissance", formatDate(row.date_of_birth)],
                ["Lieu de naissance", row.birth_place],
                ["CIN n°", row.cin_number],
                ["CIN délivré le", formatDate(row.cin_issued_at)],
            ],
        },
        {
            title: "Contact",
            fields: [
                ["Adresse", row.address],
                ["Téléphone", row.phone],
                ["Adresse e-mail", row.email],
            ],
        },
        {
            title: "Profil étudiant",
            fields: [
                ["Centre", row.school],
                ["Filière", row.filiere],
                ["Niveau", level(row)],
                ["N° de carte d'étudiant", row.student_card_number],
            ],
        },
        {
            title: "Profil enseignant / chercheur",
            fields: [
                ["Institut / Faculté", row.faculty],
                ["Département", row.department],
                ["Fonction / Grade", row.position],
                ["Spécialité / Domaine d'enseignement", row.teaching_specialty],
                ["Laboratoire / Centre de recherche", row.research_lab],
                ["Domaine de recherche", row.researcher_field],
                ["Spécialité", row.specialty],
                ["Fonction / Statut", row.profession],
                ["Diplôme", row.diploma],
                ["Lieu de travail", row.workplace],
                ["Expérience", row.experience],
            ],
        },
    ];
}

// Utilisateur ou bibliothécaire. `libraryName` sert quand la relation n'est pas chargée par l'API.
export function userSections(user, libraryName) {
    const [identity, ...rest] = personSections({
        ...user,
        last_name: user.last_name,
        first_name: user.first_name,
    });
    // Un compte stocke le nom complet dans `name`.
    identity.fields[0] = ["Nom complet", user.name];
    identity.fields[1] = ["Prénom", null];

    return [
        identity,
        rest[0],
        {
            title: "Compte",
            fields: [
                ["Numéro de compte", user.numero_compte || user.matricule],
                ["Rôle", ROLES[user.role] || user.role],
                ["Bibliothèque", user.library?.name || libraryName],
                ["Statut", user.is_active ? "Actif" : "En attente / désactivé"],
                ["Créé le", formatDateTime(user.created_at)],
            ],
        },
        ...rest.slice(1),
    ];
}

export function requestSections(request, statusLabels = {}) {
    const [identity, ...rest] = personSections(request);

    return [
        {
            title: "Demande",
            fields: [
                ["Numéro de demande", request.request_number],
                ["Statut", statusLabels[request.status] || request.status],
                ["Date de demande", formatDateTime(request.created_at)],
                ["Rôle demandé", ROLES[request.role] || request.role],
                ["Bibliothèque", request.library?.name],
                ["Numéro de compte", request.matricule],
                ["Demande saisie par", request.created_by?.name || request.createdBy?.name],
                ["Traitée par", request.processed_by?.name || request.processedBy?.name],
                ["Date de traitement", formatDateTime(request.processed_at)],
                ["Motif du rejet", request.rejection_reason],
                ["Expire le", formatDateTime(request.expires_at)],
            ],
        },
        identity,
        ...rest,
    ];
}

export function librarySections(library) {
    return [
        {
            title: "Informations",
            fields: [
                ["Nom", library.name],
                ["Description", library.description && stripHtml(library.description)],
                ["Adresse", library.address],
                ["Localisation", library.location],
                ["Horaires", library.opening_hours],
                ["Jours d'ouverture", library.opening_days],
                [
                    "Lien de localisation (carte)",
                    library.map_link && (
                        <a href={library.map_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                            {library.map_link}
                        </a>
                    ),
                ],
                ["Créée le", formatDateTime(library.created_at)],
            ],
        },
    ];
}
