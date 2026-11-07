// Préchargement des pages du menu : le fichier JavaScript d'une page est téléchargé dès le survol ou le focus
// de son lien (puis, au repos, pour tout le menu). Le clic affiche alors la page sans attendre le réseau.
// Mêmes import() que App.jsx : Vite les regroupe, rien n'est téléchargé deux fois.
// Une adresse absente de cette liste n'est simplement pas préchargée (aucune erreur).
const PAGES = {
    "/administrateur/activites": () => import("../pages/MyActivitiesPage"),
    "/administrateur/assistant": () => import("../pages/admin/AdminAssistantPage"),
    "/administrateur/avis": () => import("../pages/admin/AdminFeedbacksPage"),
    "/administrateur/bibliothecaires": () => import("../pages/admin/AdminLibrariansPage"),
    "/administrateur/bibliotheques": () => import("../pages/admin/AdminLibrariesPage"),
    "/administrateur/comptes": () => import("../pages/librarian/AccountRequestsPage"),
    "/administrateur/corbeille": () => import("../pages/admin/AdminTrashPage"),
    "/administrateur/discussions": () => import("../pages/StaffDiscussionPage"),
    "/administrateur/documents": () => import("../pages/librarian/DocumentsManagePage"),
    "/administrateur/documents/importer": () => import("../pages/librarian/DocumentImportPage"),
    "/administrateur/documents/nouveau": () => import("../pages/librarian/DocumentFormPage"),
    "/administrateur/historique": () => import("../pages/admin/AdminActivityPage"),
    "/administrateur/messages": () => import("../pages/admin/AdminMessagesPage"),
    "/administrateur/notifications": () => import("../pages/NotificationsPage"),
    "/administrateur/parametres": () => import("../pages/admin/AdminSettingsPage"),
    "/administrateur/parametres/apparence": () => import("../pages/admin/AdminThemeEditorPage"),
    "/administrateur/parametres/page-accueil": () => import("../pages/admin/AdminHomepageEditorPage"),
    "/administrateur/permissions": () => import("../pages/admin/AdminPermissionsPage"),
    "/administrateur/popularite": () => import("../pages/admin/AdminEngagementPage"),
    "/administrateur/signalements": () => import("../pages/admin/AdminFeedbacksPage"),
    "/administrateur/statistiques": () => import("../pages/admin/AdminStatsPage"),
    "/administrateur/utilisateurs": () => import("../pages/admin/AdminUsersPage"),
    "/apercu-theme": () => import("../pages/admin/ThemePreviewPage"),
    "/avis-suggestions": () => import("../pages/FeedbackPage"),
    "/bibliothecaire/activites": () => import("../pages/MyActivitiesPage"),
    "/bibliothecaire/assistant": () => import("../pages/librarian/LibrarianAssistantPage"),
    "/bibliothecaire/avis": () => import("../pages/admin/AdminFeedbacksPage"),
    "/bibliothecaire/bibliotheques": () => import("../pages/admin/AdminLibrariesPage"),
    "/bibliothecaire/corbeille": () => import("../pages/admin/AdminTrashPage"),
    "/bibliothecaire/creer-demande-compte": () => import("../pages/librarian/ServiceCreateAccountRequestPage"),
    "/bibliothecaire/discussions": () => import("../pages/StaffDiscussionPage"),
    "/bibliothecaire/documents": () => import("../pages/librarian/DocumentsManagePage"),
    "/bibliothecaire/documents/importer": () => import("../pages/librarian/DocumentImportPage"),
    "/bibliothecaire/documents/nouveau": () => import("../pages/librarian/DocumentFormPage"),
    "/bibliothecaire/messages": () => import("../pages/admin/AdminMessagesPage"),
    "/bibliothecaire/notifications": () => import("../pages/NotificationsPage"),
    "/bibliothecaire/popularite": () => import("../pages/admin/AdminEngagementPage"),
    "/bibliothecaire/signalements": () => import("../pages/admin/AdminFeedbacksPage"),
    "/bibliothecaire/statistiques": () => import("../pages/admin/AdminStatsPage"),
    "/bibliothecaire/tableau-de-bord": () => import("../pages/librarian/LibrarianDashboardPage"),
    "/bibliothecaire/tickets-comptes": () => import("../pages/librarian/AccountRequestsPage"),
    "/configuration": () => import("../pages/teacher/TeacherConfigPage"),
    "/creer-mot-de-passe": () => import("../pages/PasswordSetupPage"),
    "/creer-un-compte": () => import("../pages/CreateAccountFormPage"),
    "/espace-recherche": () => import("../pages/ResearchSpacePage"),
    "/lectures-recommandees": () => import("../pages/RecommendedReadingsPage"),
    "/mes-activites": () => import("../pages/MyActivitiesPage"),
    "/mes-cours": () => import("../pages/teacher/MyCoursesPage"),
    "/mes-depots": () => import("../pages/teacher/MySubmissionsPage"),
    "/mes-favoris": () => import("../pages/FavoritesPage"),
    "/mes-lectures": () => import("../pages/MyReadingsPage"),
    "/messages": () => import("../pages/MessagesPage"),
    "/mot-de-passe-oublie": () => import("../pages/ForgotPasswordPage"),
    "/notifications": () => import("../pages/NotificationsPage"),
    "/nouveautes": () => import("../pages/SiteUpdatesPage"),
    "/profil": () => import("../pages/ProfilePage"),
    "/questions-revision": () => import("../pages/teacher/RevisionQuestionsPage"),
    "/rapport-mensuel": () => import("../pages/admin/MonthlyReportPage"),
    "/reinitialiser-mot-de-passe": () => import("../pages/ResetPasswordPage"),
    "/signaler-un-probleme": () => import("../pages/ProblemReportPage"),
    "/tableau-de-bord": () => import("../pages/DashboardPage"),
    "/veille-scientifique": () => import("../pages/ScientificWatchPage"),
};

const requested = new Set();

export function preloadRoute(path) {
    const load = PAGES[path];
    if (!load || requested.has(path)) return Promise.resolve();
    requested.add(path);
    // Échec (hors ligne…) : on pourra réessayer ; le clic gère lui-même l'erreur d'affichage.
    return load().catch(() => requested.delete(path));
}

// Au repos : précharge les pages du menu une par une, sans gêner la page affichée.
// Rien sur une connexion économe ou très lente. Renvoie la fonction d'annulation.
export function preloadRoutesWhenIdle(paths) {
    const connection = navigator.connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return () => {};

    let cancelled = false;
    let handle = null;
    const schedule = window.requestIdleCallback || ((callback) => setTimeout(callback, 300));
    const unschedule = window.cancelIdleCallback || clearTimeout;
    const queue = [...paths];
    const next = () => {
        if (cancelled || queue.length === 0) return;
        preloadRoute(queue.shift()).finally(() => {
            if (!cancelled) handle = schedule(next);
        });
    };
    handle = schedule(next);

    return () => {
        cancelled = true;
        if (handle !== null) unschedule(handle);
    };
}
