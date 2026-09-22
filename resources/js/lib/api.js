const API_URL = import.meta.env.VITE_API_URL || "/api";

function getToken() {
    return localStorage.getItem("bm_token");
}

async function request(
    path,
    { method = "GET", body, auth = true, headers = {} } = {},
) {
    const finalHeaders = {
        Accept: "application/json",
        ...headers,
    };

    if (body && !(body instanceof FormData)) {
        finalHeaders["Content-Type"] = "application/json";
    }

    if (auth) {
        const token = getToken();
        if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: finalHeaders,
        body:
            body instanceof FormData
                ? body
                : body
                  ? JSON.stringify(body)
                  : undefined,
    });

    const isJson = response.headers
        .get("content-type")
        ?.includes("application/json");

    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
        const error = new Error(data?.message || "Une erreur est survenue.");
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

export const api = {
    // ---------------------------------------------------------
    // Public
    // ---------------------------------------------------------

    getLibraries: () => request("/libraries", { auth: false }),

    getLibrary: (id) => request(`/libraries/${id}`, { auth: false }),

    getCategories: () => request("/categories", { auth: false }),

    getAuthors: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/authors${query ? `?${query}` : ""}`, { auth: false });
    },

    createAuthor: (data) =>
        request("/authors", {
            method: "POST",
            body: data,
        }),

    searchDocuments: (params) => {
        const query = new URLSearchParams(params).toString();

        return request(`/documents?${query}`, {
            auth: false,
        });
    },

    getDocument: (slug) =>
        request(`/documents/${slug}`, {
            auth: false,
        }),

    // ---------------------------------------------------------
    // Demande publique de création de compte
    // ---------------------------------------------------------

    createAccountRequest: (data) =>
        request("/account-requests", {
            method: "POST",
            body: data,
            auth: false,
        }),

    verifyMemberAccount: (data) =>
        request("/account-requests/verify-member", {
            method: "POST",
            body: data,
            auth: false,
        }),

    recreateAccount: (data) =>
        request("/account-requests/recreate", {
            method: "POST",
            body: data,
            auth: false,
        }),

    getAccountRequest: (uuid) =>
        request(`/account-requests/${uuid}`, {
            auth: false,
        }),

    getSetupAccount: (token) =>
        request(`/account-requests/setup/${encodeURIComponent(token)}`, {
            auth: false,
        }),

    setupPassword: (token, data) =>
        request(`/account-requests/setup/${encodeURIComponent(token)}`, {
            method: "POST",
            body: data,
            auth: false,
        }),

    forgotPassword: (email) =>
        request("/forgot-password", {
            method: "POST",
            body: { email },
            auth: false,
        }),

    resetPassword: (data) =>
        request("/reset-password", {
            method: "POST",
            body: data,
            auth: false,
        }),

    // ---------------------------------------------------------
    // Authentification
    // ---------------------------------------------------------

    login: (email, password) =>
        request("/login", {
            method: "POST",
            body: {
                email,
                password,
            },
            auth: false,
        }),

    logout: () =>
        request("/logout", {
            method: "POST",
        }),

    me: () => request("/me"),

    changePassword: (data) =>
        request("/change-password", {
            method: "POST",
            body: data,
        }),

    getProfile: () => request("/profile"),

    updateProfile: (data) =>
        request("/profile", {
            method: "POST",
            body: data,
        }),

    deleteProfilePhoto: () =>
        request("/profile/photo", {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Utilisateur connecté
    // ---------------------------------------------------------

    streamDocumentUrl: (slug) => `${API_URL}/documents/${slug}/stream`,

    // extra : { history: [{question, answer}], current_page }
    askAi: (slug, question, extra = {}) =>
        request(`/documents/${slug}/ask`, {
            method: "POST",
            body: {
                question,
                ...extra,
            },
        }),

    // Réponse en flux (SSE) : onDelta reçoit le texte au fil de l'eau ;
    // retourne l'objet final { answer, sources, image, meta }.
    // Erreurs : error.streamed = true si l'erreur vient du serveur pendant
    // le flux ; sinon la requête n'a pas pu démarrer (repli possible).
    askAiStream: async (slug, question, extra = {}, { onDelta } = {}) => {
        const token = getToken();
        const response = await fetch(`${API_URL}/documents/${slug}/ask-stream`, {
            method: "POST",
            headers: {
                Accept: "text/event-stream",
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ question, ...extra }),
        });

        if (!response.ok || !response.body) {
            let data = null;
            try {
                data = await response.json();
            } catch {
                // corps non JSON
            }
            const error = new Error(data?.message || "Une erreur est survenue.");
            error.status = response.status;
            error.data = data;
            throw error;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = null;

        while (true) {
            const { value, done: finished } = await reader.read();
            if (finished) break;

            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

            let index;
            while ((index = buffer.indexOf("\n\n")) !== -1) {
                const block = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);

                let event = "message";
                let data = "";
                for (const line of block.split("\n")) {
                    if (line.startsWith("event:")) event = line.slice(6).trim();
                    else if (line.startsWith("data:")) data += line.slice(5).trim();
                }

                let payload = null;
                try {
                    payload = data ? JSON.parse(data) : null;
                } catch {
                    continue;
                }

                if (event === "delta") onDelta?.(payload?.text || "");
                else if (event === "done") done = payload;
                else if (event === "error") {
                    const error = new Error(payload?.message || "Une erreur est survenue.");
                    error.streamed = true;
                    throw error;
                }
            }
        }

        if (!done) {
            const error = new Error("La réponse a été interrompue.");
            error.streamed = true;
            throw error;
        }

        return done;
    },

    getMyDashboard: () => request("/dashboard/me"),

    // ---------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------

    getNotifications: () => request("/notifications"),

    getUnreadNotificationCount: () => request("/notifications/unread-count"),

    markNotificationRead: (id) =>
        request(`/notifications/${id}/read`, {
            method: "POST",
        }),

    markNotificationUnread: (id) =>
        request(`/notifications/${id}/unread`, {
            method: "POST",
        }),

    markAllNotificationsRead: () =>
        request("/notifications/read-all", {
            method: "POST",
        }),

    // ---------------------------------------------------------
    // Bibliothécaire / Service Numérique / Administrateur
    // ---------------------------------------------------------

    getAccountRequests: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/account-requests${query ? `?${query}` : ""}`);
    },

    /*
     * Service Numérique :
     * crée une demande de création de compte
     * pour un étudiant, enseignant ou chercheur.
     */
    createAccountRequestByLibrarian: (data) =>
        request("/account-requests/by-librarian", {
            method: "POST",
            body: data,
        }),

    verifyAccountRequest: (id) =>
        request(`/account-requests/${id}/verify`, {
            method: "POST",
        }),

    rejectAccountRequest: (id, reason = "") =>
        request(`/account-requests/${id}/reject`, {
            method: "POST",
            body: {
                reason,
            },
        }),

    // ---------------------------------------------------------
    // Documents gérés
    // ---------------------------------------------------------

    getManagedDocuments: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/documents-manage${query ? `?${query}` : ""}`);
    },

    getManagedDocument: (id) => request(`/documents-manage/${id}`),

    createDocument: (formData) =>
        request("/documents", {
            method: "POST",
            body: formData,
        }),

    updateDocument: (id, data) =>
        request(`/documents/${id}`, {
            method: data instanceof FormData ? "POST" : "PUT",
            body: data,
        }),

    publishDocument: (id) =>
        request(`/documents/${id}/publish`, {
            method: "POST",
        }),

    archiveDocument: (id) =>
        request(`/documents/${id}/archive`, {
            method: "POST",
        }),

    reindexDocument: (id) =>
        request(`/documents/${id}/reindex`, {
            method: "POST",
        }),

    deleteDocument: (id) =>
        request(`/documents/${id}`, {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Administrateur
    // ---------------------------------------------------------

    getAdminDashboard: () => request("/dashboard/admin"),

    createLibrary: (data) =>
        request("/libraries", {
            method: "POST",
            body: data,
        }),

    // POST (et non PUT) : Laravel ne lit pas les fichiers d'un PUT multipart.
    updateLibrary: (id, data) =>
        request(`/libraries/${id}`, {
            method: "POST",
            body: data,
        }),

    deleteLibrary: (id) =>
        request(`/libraries/${id}`, {
            method: "DELETE",
        }),

    getLibrarians: () => request("/librarians"),

    createLibrarian: (data) =>
        request("/librarians", {
            method: "POST",
            body: data,
        }),

    getPermissionLibrarians: () => request("/bibliothecaires"),

    getPermissions: () => request("/permissions"),

    getLibrarianPermissions: (id) => request(`/bibliothecaires/${id}/permissions`),

    updateLibrarianPermissions: (id, permissions) => request(`/bibliothecaires/${id}/permissions`, {
        method: "PUT",
        body: { permissions },
    }),

    getUsers: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/users${query ? `?${query}` : ""}`);
    },

    activateUser: (id) =>
        request(`/account-requests/users/${id}/activate`, {
            method: "POST",
        }),

    reactivateUser: (id) =>
        request(`/users/${id}/reactivate`, {
            method: "POST",
        }),

    deactivateUser: (id, reason) =>
        request(`/users/${id}/deactivate`, {
            method: "POST",
            body: {
                reason,
            },
        }),

    deleteUser: (id, reason) =>
        request(`/users/${id}`, {
            method: "DELETE",
            body: {
                reason,
            },
        }),

    createUserByAdmin: (data) =>
        request("/users/creer", {
            method: "POST",
            body: data,
        }),

    // Validation d'une demande par l'administrateur
    validateAccountRequest: (id) =>
        request(`/account-requests/${id}/validate`, {
            method: "POST",
        }),

    // Rejet d'une demande par l'administrateur
    adminRejectAccountRequest: (id, reason = "") =>
        request(`/account-requests/${id}/admin-reject`, {
            method: "POST",
            body: {
                reason,
            },
        }),

    // Validation de toutes les demandes vérifiées
    validateAllAccountRequests: () =>
        request("/account-requests/validate-all", {
            method: "POST",
        }),

    // Renvoi du lien de création du mot de passe (ex : lien expiré)
    resendSetupLink: (id) =>
        request(`/account-requests/${id}/resend-setup-link`, {
            method: "POST",
        }),

    getTrash: () => request("/trash"),

    restoreTrashUser: (id) =>
        request(`/trash/users/${id}/restore`, {
            method: "POST",
        }),

    restoreTrashDocument: (id) =>
        request(`/trash/documents/${id}/restore`, {
            method: "POST",
        }),

    forceTrashUser: (id) =>
        request(`/trash/users/${id}`, {
            method: "DELETE",
        }),

    forceTrashDocument: (id) =>
        request(`/trash/documents/${id}`, {
            method: "DELETE",
        }),

    emptyTrash: () =>
        request("/trash", {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Statistiques / Engagement
    // ---------------------------------------------------------

    getEngagementStats: () => request("/engagement-stats"),

    getFeedbacks: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/feedbacks${query ? `?${query}` : ""}`);
    },

    replyFeedback: (id, data) =>
        request(`/feedbacks/${id}/reply`, {
            method: "POST",
            body: data,
        }),

    deleteFeedback: (id) =>
        request(`/feedbacks/${id}`, {
            method: "DELETE",
        }),

    clearFeedbacks: () =>
        request("/feedbacks/clear-all", {
            method: "DELETE",
        }),

    getProblemReports: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/problem-reports${query ? `?${query}` : ""}`);
    },

    replyProblemReport: (id, data) =>
        request(`/problem-reports/${id}/reply`, {
            method: "POST",
            body: data,
        }),

    deleteProblemReport: (id) =>
        request(`/problem-reports/${id}`, {
            method: "DELETE",
        }),

    clearProblemReports: () =>
        request("/problem-reports/clear-all", {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Messages administrateur
    // ---------------------------------------------------------

    getAdminMessages: () => request("/admin-messages"),

    getMessageRecipients: () => request("/admin-messages/recipients"),

    sendAdminMessage: (data) =>
        request("/admin-messages", {
            method: "POST",
            body: data,
        }),

    deleteAdminMessage: (id) =>
        request(`/admin-messages/${id}`, {
            method: "DELETE",
        }),

    clearAdminMessageHistory: () =>
        request("/admin-messages", {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Messages utilisateur
    // ---------------------------------------------------------

    getMessages: () => request("/messages"),

    markMessageRead: (id) =>
        request(`/messages/${id}/read`, {
            method: "POST",
        }),

    deleteMessage: (id) =>
        request(`/messages/${id}`, {
            method: "DELETE",
        }),

    clearMessages: () =>
        request("/messages", {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Discussions Service Numérique
    // ---------------------------------------------------------

    getStaffLibrarians: () => request("/staff-discussions/librarians"),

    getMyStaffConversation: () => request("/staff-discussions/my-conversation"),

    getStaffConversation: (librarianId) =>
        request(`/staff-discussions/conversation/${librarianId}`),

    getStaffMessages: (conversationId) =>
        request(`/staff-discussions/${conversationId}/messages`),

    sendStaffMessage: (data) =>
        request("/staff-discussions/messages", {
            method: "POST",
            body: data,
        }),

    markStaffMessageRead: (id) =>
        request(`/staff-discussions/messages/${id}/read`, {
            method: "POST",
        }),

    deleteStaffMessage: (id) =>
        request(`/staff-discussions/messages/${id}`, {
            method: "DELETE",
        }),

    clearStaffHistory: () =>
        request("/staff-discussions/history", {
            method: "DELETE",
        }),

    // ---------------------------------------------------------
    // Actualités du site
    // ---------------------------------------------------------

    getSiteUpdates: () =>
        request("/site-updates", {
            auth: false,
        }),

    createSiteUpdate: (data) =>
        request("/site-updates", {
            method: "POST",
            body: data,
        }),

    // ---------------------------------------------------------
    // Favoris
    // ---------------------------------------------------------

    getFavorites: () => request("/favorites"),

    // ---------------------------------------------------------
    // Consultations / IA
    // ---------------------------------------------------------

    getMyConsultations: () => request("/mes-consultations"),

    getMyAiQueries: () => request("/mes-questions-ia"),

    getMyReadings: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/mes-lectures${query ? `?${query}` : ""}`);
    },

    // ---------------------------------------------------------
    // Espace chercheur : historique des recherches + veille
    // ---------------------------------------------------------

    getMySearches: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/research/searches${query ? `?${query}` : ""}`);
    },

    saveSearch: (data) =>
        request("/research/searches", { method: "POST", body: data }),

    deleteSearch: (id) =>
        request(`/research/searches/${id}`, { method: "DELETE" }),

    clearSearches: () => request("/research/searches", { method: "DELETE" }),

    getWatchTopics: () => request("/research/watch-topics"),

    addWatchTopic: (data) =>
        request("/research/watch-topics", { method: "POST", body: data }),

    deleteWatchTopic: (id) =>
        request(`/research/watch-topics/${id}`, { method: "DELETE" }),

    markWatchTopicSeen: (id) =>
        request(`/research/watch-topics/${id}/seen`, { method: "POST" }),

    getWatchTopicDocuments: (id, params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(
            `/research/watch-topics/${id}/documents${query ? `?${query}` : ""}`,
        );
    },

    getAdminConsultations: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/consultations${query ? `?${query}` : ""}`);
    },

    getAdminAiQueries: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/ai-queries${query ? `?${query}` : ""}`);
    },

    getAdminFavorites: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/all-favorites${query ? `?${query}` : ""}`);
    },

    toggleFavorite: (slug) =>
        request(`/documents/${slug}/favorite`, {
            method: "POST",
        }),

    // ---------------------------------------------------------
    // Feedback / signalement
    // ---------------------------------------------------------

    createFeedback: (data) =>
        request("/feedbacks", {
            method: "POST",
            body: data,
        }),

    createProblemReport: (data) =>
        request("/problem-reports", {
            method: "POST",
            body: data,
        }),

    // ---------------------------------------------------------
    // Journal d'activité
    // ---------------------------------------------------------

    getActivityLogs: (params = {}) => {
        const query = new URLSearchParams(params).toString();

        return request(`/activity-logs${query ? `?${query}` : ""}`);
    },

    // ---------------------------------------------------------
    // Assistant IA de gestion (administrateur)
    // ---------------------------------------------------------

    askAdminAssistant: (question, history = []) =>
        request("/assistant/admin", {
            method: "POST",
            body: { question, history },
        }),

    // Assistant du bibliothécaire : périmètre = sa bibliothèque, imposé par le serveur.
    askLibrarianAssistant: (question, history = []) =>
        request("/assistant/librarian", {
            method: "POST",
            body: { question, history },
        }),
};

export { API_URL };
