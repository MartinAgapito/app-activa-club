// Guard de estado de cuenta del socio (RN-ACT-06/07; bug P1-5 de la
// auditoría de integración del Sprint 1).
//
// `RequireRole` (UX) solo valida que la sesión tenga rol `member`; no
// verifica el `memberStatus` real del socio. Sin este guard, un socio
// `PENDING`/`APPROVED`/`REJECTED` podía entrar a `/socio/*` como si
// estuviera `ACTIVE`, y la pantalla `PendingApprovalPage` quedaba
// inalcanzable (nunca se enrutaba la redirección automática, ver
// docs/mapa-de-rutas.md §4.1).
//
// Este guard envuelve el árbol de rutas `/socio/*` (dentro de
// `RequireRole allow={['member']}`) y consulta `GET /members/me` mediante
// `useMemberProfileQuery` (misma query que `ProfilePage`/`PendingApprovalPage`):
// si ya se resolvió en otro punto del árbol, TanStack Query reutiliza la
// respuesta cacheada en vez de repetir la petición.
//
// Mientras se resuelve la consulta se muestra un spinner de pantalla
// completa (nunca el contenido protegido) para evitar el parpadeo de
// contenido de socio antes de confirmar el estado real de la cuenta.

import { Navigate, Outlet } from 'react-router-dom';
import { Button, ErrorState, Spinner } from '@activa-club/ui';
import { ApiRequestError } from '../../lib/api/http-client';
import { useMemberProfileQuery } from '../../members/profile-query';

/** Único estado habilitado para el área de socio: `ACTIVE` (RN-ACT-06/07).
 * Cualquier otro estado (`MIGRATED`, `PENDING`, `APPROVED`, `REJECTED`) se
 * redirige a `/cuenta/pendiente-aprobacion`. */
const ENABLED_STATUS = 'ACTIVE';

export function RequireActiveMember() {
  const profileQuery = useMemberProfileQuery();

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner size="lg" label="Verificando tu cuenta…" />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <ErrorState
          title="No pudimos verificar tu cuenta"
          description={
            profileQuery.error instanceof ApiRequestError
              ? profileQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void profileQuery.refetch()}>Reintentar</Button>}
        />
      </div>
    );
  }

  if (profileQuery.data.memberStatus !== ENABLED_STATUS) {
    return <Navigate to="/cuenta/pendiente-aprobacion" replace />;
  }

  return <Outlet />;
}
