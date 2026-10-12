import { AppShell } from './AppShell';
import { ADMIN_NAV } from './navigation';
import { useAuth } from '../auth/AuthContext';

/**
 * Estructura del administrador. La sesión (Cognito) hoy no expone nombre ni
 * correo en `useAuth()`, por lo que se muestra "Administrador" como nombre.
 */
export function AdminLayout() {
  const { signOut } = useAuth();

  return (
    <AppShell
      items={ADMIN_NAV}
      navLabel="Navegación de administración"
      homeTo="/admin"
      userName="Administrador"
      roleLabel="Administrador"
      onSignOut={signOut}
    />
  );
}
