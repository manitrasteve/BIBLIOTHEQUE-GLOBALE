// Majorité (18 ans révolus aujourd'hui) à partir d'une date « AAAA-MM-JJ » d'un champ date.
// Même règle que le serveur (AccountRequestController::isAdult) : la CIN d'un étudiant
// n'est demandée qu'à partir de 18 ans.
// Une date incomplète (année en cours de saisie, avant 1900) ou future n'est pas prise en compte.
export function isAdult(dateOfBirth) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth || "");
    if (!match) return false;

    const [year, month, day] = match.slice(1).map(Number);
    if (year < 1900) return false;

    const today = new Date();
    const adulthood = new Date(year + 18, month - 1, day);
    return adulthood <= new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

// Date de naissance saisie et exploitable (pour savoir s'il faut afficher un message sur la CIN).
export function isCompleteBirthDate(dateOfBirth) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dateOfBirth || "");
    return Boolean(match) && Number(match[1]) >= 1900;
}
