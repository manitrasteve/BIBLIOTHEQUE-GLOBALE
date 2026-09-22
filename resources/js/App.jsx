import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import PermissionRoute from "./components/PermissionRoute";
import LibrarianLayout from "./components/LibrarianLayout";
import AdminLayout from "./components/AdminLayout";

import HomePage from "./pages/HomePage";
import SearchResultsPage from "./pages/SearchResultsPage";
import DocumentDetailPage from "./pages/DocumentDetailPage";
import LoginPage from "./pages/LoginPage";
import CreateAccountFormPage from "./pages/CreateAccountFormPage";
import CreateAccountSelectLibraryPage from "./pages/CreateAccountSelectLibraryPage";
import CreateAccountLibraryPage from "./pages/CreateAccountLibraryPage";
import TicketReceiptPage from "./pages/TicketReceiptPage";
import DashboardPage from "./pages/DashboardPage";
import NotificationsPage from "./pages/NotificationsPage";
import FavoritesPage from "./pages/FavoritesPage";
import FeedbackPage from "./pages/FeedbackPage";
import ProblemReportPage from "./pages/ProblemReportPage";
import ProfilePage from "./pages/ProfilePage";
import PasswordSetupPage from "./pages/PasswordSetupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SiteUpdatesPage from "./pages/SiteUpdatesPage";
import UserLayout from "./components/UserLayout";
import NotFoundPage from "./pages/NotFoundPage";
import MyReadingsPage from "./pages/MyReadingsPage";
import MyActivitiesPage from "./pages/MyActivitiesPage";
import ResearchSpacePage from "./pages/ResearchSpacePage";
import MySearchesPage from "./pages/MySearchesPage";
import ScientificWatchPage from "./pages/ScientificWatchPage";

const MEMBER_ROLES = ["etudiant", "enseignant", "chercheur"];

function HomeOnlyFooter() {
    const location = useLocation();
    return location.pathname === "/" ? <Footer /> : null;
}

import AccountRequestsPage from "./pages/librarian/AccountRequestsPage";
import DocumentsManagePage from "./pages/librarian/DocumentsManagePage";
import LibrarianDashboardPage from "./pages/librarian/LibrarianDashboardPage";
import DocumentFormPage from "./pages/librarian/DocumentFormPage";
import ServiceCreateAccountRequestPage from "./pages/librarian/ServiceCreateAccountRequestPage";

import AdminStatsPage from "./pages/admin/AdminStatsPage";
import AdminLibrariesPage from "./pages/admin/AdminLibrariesPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminTrashPage from "./pages/admin/AdminTrashPage";
import AdminActivityPage from "./pages/admin/AdminActivityPage";
import AdminAssistantPage from "./pages/admin/AdminAssistantPage";
import LibrarianAssistantPage from "./pages/librarian/LibrarianAssistantPage";
import AdminEngagementPage from "./pages/admin/AdminEngagementPage";
import {
    AdminFeedbacksPage,
    AdminReportsPage,
} from "./pages/admin/AdminFeedbacksPage";
import AdminMessagesPage from "./pages/admin/AdminMessagesPage";
import AdminLibrariansPage from "./pages/admin/AdminLibrariansPage";
import AdminPermissionsPage from "./pages/admin/AdminPermissionsPage";
import MessagesPage from "./pages/MessagesPage";
import StaffDiscussionPage from "./pages/StaffDiscussionPage";

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <div className="min-h-screen bg-paper text-ink font-sans flex flex-col dashboard-bg">
                    <Header />
                    <main className="flex-1">
                        <Routes>
                            {/* Public */}
                            <Route path="/" element={<HomePage />} />
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
                                element={<CreateAccountSelectLibraryPage />}
                            />
                            <Route
                                path="/creer-un-compte/:libraryId"
                                element={<CreateAccountLibraryPage />}
                            />
                            <Route
                                path="/creer-un-compte/:libraryId/demande"
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
                                    element={<RoleRoute roles={MEMBER_ROLES}><MyReadingsPage /></RoleRoute>}
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
                                    path="/mes-recherches"
                                    element={<RoleRoute roles={["chercheur"]}><MySearchesPage /></RoleRoute>}
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
                            </Route>

                            {/* Adresse inconnue */}
                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                    </main>
                    <HomeOnlyFooter />
                </div>
            </BrowserRouter>
        </AuthProvider>
    );
}
