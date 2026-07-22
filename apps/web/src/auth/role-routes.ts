// Navegación por rol tras iniciar sesión — US-014, criterio de aceptación 2.

import type { Role } from '@activa-club/shared-types';

const ROLE_HOME: Record<Role, string> = {
  member: '/socio',
  admin: '/admin',
};

/** Ruta a la que se dirige a un usuario recién autenticado, según su rol. Si
 * `from` es una ruta a la que ese rol tiene acceso (el usuario llegó a
 * `/login` redirigido por `RequireRole` desde una ruta protegida), se respeta
 * en vez del home por defecto. */
export function resolveRedirectPath(role: Role, from?: string | null): string {
  const home = ROLE_HOME[role];
  if (from && from.startsWith(home)) {
    return from;
  }
  return home;
}
