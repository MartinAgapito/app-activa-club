import { Badge, Card } from '@activa-club/ui';
import { useAuth } from '../../auth/AuthContext';

/**
 * Estado de espera para un socio nuevo (RN-ACT-06/07): tras registrarse queda
 * en `PENDING` hasta que un administrador apruebe o rechace la solicitud; una
 * vez aprobado, debe pagar su primera membresía para quedar `ACTIVE` y poder
 * reservar. Esta pantalla se alcanza con sesión iniciada (rol `member`) pero
 * `memberStatus` distinto de `ACTIVE`.
 *
 * Sprint 0: solo la vista y la ruta existen (ver mapa-de-rutas.md). La
 * verificación real de `memberStatus` contra `GET /members/me` y la
 * redirección automática desde el guard se implementan en Sprint 1.
 */
export function PendingApprovalPage() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <Badge variant="warning">Solicitud en revisión</Badge>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Tu solicitud está siendo evaluada
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Un administrador debe aprobar tu registro antes de que puedas continuar. Te avisaremos por
          correo y notificación cuando haya una novedad (RN-ACT-06).
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Una vez aprobado, deberás pagar tu primera membresía para activar tu cuenta y poder
          reservar (RN-ACT-07).
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-6 text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          Cerrar sesión
        </button>
      </Card>
    </div>
  );
}
