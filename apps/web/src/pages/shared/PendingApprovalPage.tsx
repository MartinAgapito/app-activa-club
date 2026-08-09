import { Link, Navigate } from 'react-router-dom';
import { Badge, Button, buttonVariants, Card, ErrorState, Spinner } from '@activa-club/ui';
import type { MemberStatus } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { ApiRequestError } from '../../lib/api/http-client';
import { useMemberProfileQuery } from '../../members/profile-query';
import { MEMBER_STATUS_BADGE_VARIANT, MEMBER_STATUS_LABELS } from '../../lib/format/member-status';

/**
 * Estado de espera para un socio cuya cuenta todavía no está `ACTIVE`
 * (RN-ACT-06/07): un socio nuevo queda `PENDING` hasta ser aprobado o
 * rechazado por un administrador; tras la aprobación (`APPROVED`) debe pagar
 * su primera membresía para quedar `ACTIVE` y poder reservar. Se alcanza con
 * sesión iniciada (rol `member`) desde `RequireActiveMember`
 * (routes/guards/RequireActiveMember.tsx), que redirige aquí cuando
 * `memberStatus !== 'ACTIVE'`.
 *
 * Consulta `GET /members/me` (misma query que `RequireActiveMember` y
 * `ProfilePage`, cacheada por TanStack Query: no repite la petición si ya se
 * resolvió al entrar a `/socio`) para mostrar el mensaje correcto según el
 * estado real — "en revisión" para `PENDING`, "aprobado, falta pagar" para
 * `APPROVED` y "rechazada" para `REJECTED` — en vez de un texto genérico que
 * no aplica a todos los casos.
 */
export function PendingApprovalPage() {
  const { signOut } = useAuth();
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

  const { memberStatus } = profileQuery.data;

  // Una cuenta ya ACTIVE no debería quedarse en esta pantalla (p. ej. la
  // visita directamente o quedó en caché desde antes de activarse).
  if (memberStatus === 'ACTIVE') {
    return <Navigate to="/socio" replace />;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <Badge variant={MEMBER_STATUS_BADGE_VARIANT[memberStatus]}>
          {MEMBER_STATUS_LABELS[memberStatus]}
        </Badge>
        <StatusMessage status={memberStatus} rejectionReason={profileQuery.data.rejectionReason} />
        {memberStatus === 'APPROVED' ? (
          <Link
            to="/socio/membresia/pagar"
            className={buttonVariants({ fullWidth: true, className: 'mt-6' })}
          >
            Pagar mi primera membresía
          </Link>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          className="mt-4 text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          Cerrar sesión
        </button>
      </Card>
    </div>
  );
}

interface StatusMessageProps {
  status: MemberStatus;
  rejectionReason: string | null;
}

function StatusMessage({ status, rejectionReason }: StatusMessageProps) {
  if (status === 'REJECTED') {
    return (
      <>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Tu solicitud fue rechazada</h1>
        <p className="mt-2 text-sm text-slate-600">
          Un administrador revisó tu solicitud y no fue aprobada
          {rejectionReason ? `: ${rejectionReason}.` : '.'}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Si crees que se trata de un error, contacta al club para más información.
        </p>
      </>
    );
  }

  if (status === 'APPROVED') {
    return (
      <>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Tu solicitud fue aprobada</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ya puedes continuar: solo falta pagar tu primera membresía para activar tu cuenta y poder
          reservar (RN-ACT-07).
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">
        Tu solicitud está siendo evaluada
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Un administrador debe aprobar tu registro antes de que puedas continuar. Te avisaremos por
        correo y notificación cuando haya una novedad (RN-ACT-06).
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Una vez aprobado, deberás pagar tu primera membresía para activar tu cuenta y poder reservar
        (RN-ACT-07).
      </p>
    </>
  );
}
