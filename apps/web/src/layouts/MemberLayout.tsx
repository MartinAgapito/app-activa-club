import { AppShell } from './AppShell';
import { MEMBER_NAV } from './navigation';
import { useAuth } from '../auth/AuthContext';
import { useMemberProfileQuery } from '../members/profile-query';

/** Estructura del socio: nombre de pila desde `GET /members/me` ("Socio" si falla). */
export function MemberLayout() {
  const { signOut } = useAuth();
  const profile = useMemberProfileQuery();
  const firstName = profile.data?.firstName.trim();

  return (
    <AppShell
      items={MEMBER_NAV}
      navLabel="Navegación de socio"
      homeTo="/socio"
      userName={firstName ? firstName : 'Socio'}
      roleLabel="Socio"
      profileTo="/socio/perfil"
      onSignOut={signOut}
    />
  );
}
