// Même règles que les gardes de App.jsx (RoleRoute, PermissionRoute) : sert à la page de connexion pour ne pas
// renvoyer un compte vers une page demandée avant la connexion qui lui serait refusée.
const MEMBERS = ["etudiant", "enseignant", "chercheur"];
const STAFF = ["administrateur", "bibliothecaire"];
const ADMIN = ["administrateur"];
const LIBRARIAN = ["bibliothecaire"];

// Du plus précis au plus général : la première règle dont le préfixe correspond s'applique.
const RULES = [
    { prefix: "/administrateur", roles: ADMIN },
    { prefix: "/apercu-page-accueil", roles: ADMIN },
    { prefix: "/apercu-theme", roles: ADMIN },
    { prefix: "/rapport-mensuel", roles: STAFF, permissions: ["voir_statistiques"] },
    { prefix: "/bibliothecaire/creer-demande-compte", roles: LIBRARIAN, permissions: ["ajouter_utilisateur"] },
    { prefix: "/bibliothecaire/assistant", roles: LIBRARIAN },
    { prefix: "/bibliothecaire/corbeille", roles: STAFF, permissions: ["voir_corbeille"] },
    { prefix: "/bibliothecaire/bibliotheques", roles: STAFF, permissions: ["voir_bibliotheques", "ajouter_bibliotheque", "modifier_bibliotheque"] },
    { prefix: "/bibliothecaire/statistiques", roles: STAFF, permissions: ["voir_statistiques"] },
    { prefix: "/bibliothecaire/popularite", roles: STAFF, permissions: ["voir_popularite"] },
    { prefix: "/bibliothecaire/avis", roles: STAFF, permissions: ["voir_avis_utilisateurs"] },
    { prefix: "/bibliothecaire/signalements", roles: STAFF, permissions: ["voir_signalements"] },
    { prefix: "/bibliothecaire", roles: STAFF },
    { prefix: "/mes-lectures", roles: [...MEMBERS, ...STAFF] },
    { prefix: "/mes-activites", roles: MEMBERS },
    { prefix: "/espace-recherche", roles: ["chercheur"] },
    { prefix: "/veille-scientifique", roles: ["chercheur"] },
    { prefix: "/lectures-recommandees", roles: ["etudiant"] },
    { prefix: "/configuration", roles: ["enseignant"] },
    { prefix: "/mes-cours", roles: ["enseignant"] },
    { prefix: "/mes-depots", roles: ["enseignant"] },
    { prefix: "/questions-revision", roles: ["enseignant"] },
];

export function canAccessPath(path, user) {
    const pathname = String(path).split(/[?#]/)[0];
    const rule = RULES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!rule) return true;

    const role = user?.role === "admin" ? "administrateur" : user?.role;
    if (!rule.roles.includes(role)) return false;
    if (role === "administrateur" || !rule.permissions) return true;
    return rule.permissions.some((permission) => user?.permissions?.includes(permission));
}

// Page d'arrivée d'un compte, sans page demandée (ou demandée mais refusée).
export function defaultPathFor(user) {
    if (user?.role === "administrateur" || user?.role === "admin") return "/administrateur/statistiques";
    if (user?.role === "bibliothecaire") return "/bibliothecaire/tableau-de-bord";
    return "/tableau-de-bord";
}
