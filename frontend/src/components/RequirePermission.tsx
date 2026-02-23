import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';

interface RequirePermissionProps {
  check: (user: import('../stores/auth').User | null) => boolean;
  redirectTo: string;
  children: React.ReactNode;
}

export default function RequirePermission({ check, redirectTo, children }: RequirePermissionProps) {
  const { user } = useAuth();
  if (!check(user)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
