import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SkeletonProfile } from "./Skeleton";

export default function PermissionRoute({ permission, permissions, children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <div className="px-6 py-10"><SkeletonProfile /></div>;
    if (!user) return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;

    const isAdmin = user.role === "administrateur" || user.role === "admin";
    const allowed = permission ? user.permissions?.includes(permission) : permissions?.some((item) => user.permissions?.includes(item));

    if (!isAdmin && !allowed) {
        return <Navigate to="/bibliothecaire/tableau-de-bord" replace />;
    }

    return children;
}
