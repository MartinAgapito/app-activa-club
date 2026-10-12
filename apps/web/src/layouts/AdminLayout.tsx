import { AppShell } from './AppShell';
import { ADMIN_NAV } from './navigation';
import { useAuth } from '../auth/AuthContext';

/**
 * Estructura del administrador. El nombre del menú de usuario sale del ID
 * token (nombre, si lo trae; si no, el correo) con "Administrador" como
 * respaldo cuando la sesión no expone ninguno.
 */
export function AdminLayout() {
  const { signOut, email, displayName } = useAuth();

  return (
    <AppShell
      items={ADMIN_NAV}
      navLabel="Navegación de administración"
      homeTo="/admin"
      userName={email ?? displayName ?? 'Administrador'}
      roleLabel="Administrador"
      onSignOut={signOut}
    />
  );
}
