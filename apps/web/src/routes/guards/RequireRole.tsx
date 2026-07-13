// Guard de rutas por rol (UX, no control de seguridad — ver ADR-0002 y
// apps/web/docs/mapa-de-rutas.md). El backend revalida siempre la autorización
// real vía el claim `cognito:groups` del JWT.

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';

export interface RequireRoleProps {
  allow: Role[];
}

export function RequireRole({ allow }: RequireRoleProps) {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!role || !allow.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
