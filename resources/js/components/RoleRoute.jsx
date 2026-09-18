import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SkeletonProfile } from './Skeleton';

// Comme ProtectedRoute, mais restreint en plus l'accès à certains rôles.
// Usage : <RoleRoute roles={['bibliothecaire', 'administrateur']}>...</RoleRoute>
export default function RoleRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="px-6 py-10"><SkeletonProfile /></div>;
  }

  if (!user) {
    return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  }

  const normalizedRoles = roles.map((role) => role === "admin" ? "administrateur" : role);
  const normalizedUserRole = user.role === "admin" ? "administrateur" : user.role;

  if (!normalizedRoles.includes(normalizedUserRole)) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-ink-soft">Cet espace ne vous est pas accessible.</p>
      </div>
    );
  }

  return children;
}
