import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import PermissionRoute from "./components/PermissionRoute";
import LibrarianLayout from "./components/LibrarianLayout";
import AdminLayout from "./components/AdminLayout";
import PageLoader from "./components/PageLoader";
import PageErrorBoundary from "./components/PageErrorBoundary";
import UserLayout from "./components/UserLayout";
import NotFoundPage from "./pages/NotFoundPage";

import HomePage from "./pages/HomePage";
import SearchResultsPage from "./pages/SearchResultsPage";
import LoginPage from "./pages/LoginPage";

const DocumentDetailPage = lazy(() => import("./pages/DocumentDetailPage"));
const CreateAccountFormPage = lazy(() => import("./pages/CreateAccountFormPage"));
const TicketReceiptPage = lazy(() => import("./pages/TicketReceiptPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const ProblemReportPage = lazy(() => import("./pages/ProblemReportPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const PasswordSetupPage = lazy(() => import("./pages/PasswordSetupPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const SiteUpdatesPage = lazy(() => import("./pages/SiteUpdatesPage"));
const MyReadingsPage = lazy(() => import("./pages/MyReadingsPage"));
const MyActivitiesPage = lazy(() => import("./pages/MyActivitiesPage"));
const ResearchSpacePage = lazy(() => import("./pages/ResearchSpacePage"));
const ScientificWatchPage = lazy(() => import("./pages/ScientificWatchPage"));

const MEMBER_ROLES = ["etudiant", "enseignant", "chercheur"];

// Une page qui échoue (fichier de page introuvable hors ligne...) ne casse pas toute l'application ;
// changer d'adresse retente l'affichage.
function PageBoundary({ children }) {
    const location = useLocation();
    return <PageErrorBoundary resetKey={location.pathname}>{children}</PageErrorBoundary>;
}

function HomeOnlyFooter() {
    const location = useLocation();
    return location.pathname === "/" ? <Footer /> : null;
}

const AccountRequestsPage = lazy(() => import("./pages/librarian/AccountRequestsPage"));
const DocumentsManagePage = lazy(() => import("./pages/librarian/DocumentsManagePage"));
const LibrarianDashboardPage = lazy(() => import("./pages/librarian/LibrarianDashboardPage"));
const DocumentFormPage = lazy(() => import("./pages/librarian/DocumentFormPage"));
const DocumentImportPage = lazy(() => import("./pages/librarian/DocumentImportPage"));
const ServiceCreateAccountRequestPage = lazy(() => import("./pages/librarian/ServiceCreateAccountRequestPage"));

const AdminStatsPage = lazy(() => import("./pages/admin/AdminStatsPage"));
const AdminLibrariesPage = lazy(() => import("./pages/admin/AdminLibrariesPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminTrashPage = lazy(() => import("./pages/admin/AdminTrashPage"));
const AdminActivityPage = lazy(() => import("./pages/admin/AdminActivityPage"));
const AdminAssistantPage = lazy(() => import("./pages/admin/AdminAssistantPage"));
const LibrarianAssistantPage = lazy(() => import("./pages/librarian/LibrarianAssistantPage"));
const AdminEngagementPage = lazy(() => import("./pages/admin/AdminEngagementPage"));
const AdminFeedbacksPage = lazy(() => import("./pages/admin/AdminFeedbacksPage").then((m) => ({ default: m.AdminFeedbacksPage })));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminFeedbacksPage").then((m) => ({ default: m.AdminReportsPage })));
const AdminMessagesPage = lazy(() => import("./pages/admin/AdminMessagesPage"));
const AdminLibrariansPage = lazy(() => import("./pages/admin/AdminLibrariansPage"));
const AdminPermissionsPage = lazy(() => import("./pages/admin/AdminPermissionsPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminHomepageEditorPage = lazy(() => import("./pages/admin/AdminHomepageEditorPage"));
const AdminThemeEditorPage = lazy(() => import("./pages/admin/AdminThemeEditorPage"));
const ThemePreviewPage = lazy(() => import("./pages/admin/ThemePreviewPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const StaffDiscussionPage = lazy(() => import("./pages/StaffDiscussionPage"));

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <ToastProvider>
                <div className="min-h-screen bg-paper text-ink font-sans flex flex-col dashboard-bg">
                    <a href="#contenu" className="skip-link">Aller au contenu</a>
                    <Header />
                    <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
                        {/* Pages chargées à la demande : le visiteur ne télécharge pas les espaces admin / bibliothécaire. */}
                        <PageBoundary>
                        <Suspense fallback={<PageLoader />}>
                        <Routes>
                            {/* Public */}
                            <Route path="/" element={<HomePage />} />
                            {/* Aperçu du brouillon de la page d'accueil (administrateur) */}
                            <Route
                                path="/apercu-page-accueil"
                                element={<RoleRoute roles={["administrateur"]}><HomePage preview /></RoleRoute>}
                            />
                            {/* Aperçu des couleurs de l'Apparence du site (administrateur) */}
                            <Route
                                path="/apercu-theme"
                                element={<RoleRoute roles={["administrateur"]}><ThemePreviewPage /></RoleRoute>}
                            />
                            <Route
                                path="/recherche"
                                element={<SearchResultsPage />}
                            />
                            <Route
                                path="/documents/:slug"
                                element={<DocumentDetailPage />}
                            />
                            <Route path="/connexion" element={<LoginPage />} />
                            <Route
                                path="/creer-un-compte"
                                element={<CreateAccountFormPage />}
                            />
                            <Route
                                path="/ticket/:uuid"
                                element={<TicketReceiptPage />}
                            />

                            {/* Utilisateur connecté */}
                            <Route
                                path="/creer-mot-de-passe"
                                element={<PasswordSetupPage />}
                            />
                            <Route
                                path="/mot-de-passe-oublie"
                                element={<ForgotPasswordPage />}
                            />
                            <Route
                                path="/reinitialiser-mot-de-passe"
                                element={<ResetPasswordPage />}
                            />
                            <Route
                                path="/nouveautes"
                                element={<SiteUpdatesPage />}
                            />

                            <Route
                                element={
                                    <ProtectedRoute>
                                        <UserLayout />
                                    </ProtectedRoute>
                                }
                            >
                                <Route
                                    path="/tableau-de-bord"
                                    element={<DashboardPage />}
                                />
                                <Route
                                    path="/notifications"
                                    element={<NotificationsPage />}
                                />
                                <Route
                                    path="/messages"
                                    element={<MessagesPage />}
                                />
                                <Route
                                    path="/mes-favoris"
                                    element={<FavoritesPage />}
                                />
                                <Route
                                    path="/mes-lectures"
                                    element={<RoleRoute roles={[...MEMBER_ROLES, "administrateur", "bibliothecaire"]}><MyReadingsPage /></RoleRoute>}
                                />
                                <Route
                                    path="/mes-activites"
                                    element={<RoleRoute roles={MEMBER_ROLES}><MyActivitiesPage /></RoleRoute>}
                                />
                                <Route
                                    path="/espace-recherche"
                                    element={<RoleRoute roles={["chercheur"]}><ResearchSpacePage /></RoleRoute>}
                                />
                                <Route
                                    path="/veille-scientifique"
                                    element={<RoleRoute roles={["chercheur"]}><ScientificWatchPage /></RoleRoute>}
                                />
                                <Route
                                    path="/avis-suggestions"
                                    element={<FeedbackPage />}
                                />
                                <Route
                                    path="/signaler-un-probleme"
                                    element={<ProblemReportPage />}
                                />
                                <Route
                                    path="/profil"
                                    element={<ProfilePage />}
                                />
                            </Route>

                            {/* Bibliothécaire + Admin */}
                            <Route
                                path="/bibliothecaire"
                                element={
                                    <RoleRoute
                                        roles={[
                                            "bibliothecaire",
                                            "administrateur",
                                        ]}
                                    >
                                        <LibrarianLayout />
                                    </RoleRoute>
                                }
                            >
                                <Route
                                    index
                                    element={
                                        <Navigate
                                            to="tableau-de-bord"
                                            replace
                                        />
                                    }
                                />

                                <Route
                                    path="tableau-de-bord"
                                    element={<LibrarianDashboardPage />}
                                />

                                <Route
                                    path="tickets-comptes"
                                    element={<AccountRequestsPage />}
                                />

                                <Route
                                    path="creer-demande-compte"
                                    element={
                                        <RoleRoute roles={["bibliothecaire"]}>
                                            <PermissionRoute permission="ajouter_utilisateur">
                                                <ServiceCreateAccountRequestPage />
                                            </PermissionRoute>
                                        </RoleRoute>
                                    }
                                />
                                <Route
                                    path="catalogue"
                                    element={<SearchResultsPage />}
                                />
                                <Route
                                    path="notifications"
                                    element={<NotificationsPage />}
                                />
                                <Route path="documents" element={<DocumentsManagePage />} />
                                <Route path="corbeille" element={<PermissionRoute permission="voir_corbeille"><AdminTrashPage /></PermissionRoute>} />
                                <Route path="bibliotheques" element={<PermissionRoute permissions={["voir_bibliotheques", "ajouter_bibliotheque", "modifier_bibliotheque"]}><AdminLibrariesPage /></PermissionRoute>} />
                                <Route path="statistiques" element={<PermissionRoute permission="voir_statistiques"><AdminStatsPage /></PermissionRoute>} />
                                <Route path="popularite" element={<PermissionRoute permission="voir_popularite"><AdminEngagementPage /></PermissionRoute>} />
                                <Route path="avis" element={<PermissionRoute permission="voir_avis_utilisateurs"><AdminFeedbacksPage /></PermissionRoute>} />
                                <Route path="signalements" element={<PermissionRoute permission="voir_signalements"><AdminReportsPage /></PermissionRoute>} />
                                <Route
                                    path="documents/nouveau"
                                    element={<DocumentFormPage />}
                                />
                                <Route path="documents/importer" element={<DocumentImportPage />} />
                                <Route
                                    path="documents/:id/modifier"
                                    element={<DocumentFormPage />}
                                />
                                <Route path="assistant" element={<RoleRoute roles={["bibliothecaire"]}><LibrarianAssistantPage /></RoleRoute>} />
                                <Route path="activites" element={<MyActivitiesPage />} />
                                <Route
                                    path="messages"
                                    element={<AdminMessagesPage />}
                                />
                                <Route
                                    path="discussions"
                                    element={<StaffDiscussionPage />}
                                />
                            </Route>

                            {/* Admin uniquement */}
                            <Route
                                path="/administrateur"
                                element={
                                    <RoleRoute roles={["administrateur"]}>
                                        <AdminLayout />
                                    </RoleRoute>
                                }
                            >
                                <Route
                                    index
                                    element={
                                        <Navigate to="statistiques" replace />
                                    }
                                />
                                <Route
                                    path="statistiques"
                                    element={<AdminStatsPage />}
                                />
                                <Route
                                    path="assistant"
                                    element={<AdminAssistantPage />}
                                />
                                <Route
                                    path="notifications"
                                    element={<NotificationsPage />}
                                />
                                <Route
                                    path="bibliotheques"
                                    element={<AdminLibrariesPage />}
                                />
                                <Route
                                    path="utilisateurs"
                                    element={<AdminUsersPage />}
                                />
                                <Route
                                    path="corbeille"
                                    element={<AdminTrashPage />}
                                />
                                <Route
                                    path="bibliothecaires"
                                    element={<AdminLibrariansPage />}
                                />
                                <Route path="documents" element={<DocumentsManagePage />} />
                                <Route path="documents/nouveau" element={<DocumentFormPage />} />
                                <Route path="documents/importer" element={<DocumentImportPage />} />
                                <Route path="documents/:id/modifier" element={<DocumentFormPage />} />
                                <Route path="permissions" element={<AdminPermissionsPage />} />
                                <Route
                                    path="comptes"
                                    element={<AccountRequestsPage />}
                                />
                                <Route
                                    path="popularite"
                                    element={<AdminEngagementPage />}
                                />
                                <Route
                                    path="avis"
                                    element={<AdminFeedbacksPage />}
                                />
                                <Route
                                    path="signalements"
                                    element={<AdminReportsPage />}
                                />
                                <Route
                                    path="messages"
                                    element={<AdminMessagesPage />}
                                />
                                <Route
                                    path="discussions"
                                    element={<StaffDiscussionPage />}
                                />
                                <Route path="activites" element={<MyActivitiesPage />} />
                                <Route
                                    path="historique"
                                    element={<AdminActivityPage />}
                                />
                                <Route path="parametres" element={<AdminSettingsPage />} />
                                <Route path="parametres/page-accueil" element={<AdminHomepageEditorPage />} />
                                <Route path="parametres/apparence" element={<AdminThemeEditorPage />} />
                            </Route>

                            {/* Adresse inconnue */}
                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                        </Suspense>
                        </PageBoundary>
                    </main>
                    <HomeOnlyFooter />
                </div>
                </ToastProvider>
            </BrowserRouter>
        </AuthProvider>
    );
}
