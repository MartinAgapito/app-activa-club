// Mi membresía — US-020.
//
// Consulta los planes de membresía disponibles (`GET /memberships/plans`,
// docs/api/contratos-api.md §5) y el estado de la membresía vigente del
// socio (`GET /members/me`, ya cacheado por `RequireActiveMember` al entrar
// a `/socio/*`). Las dos consultas son independientes: si la del perfil
// falla o tarda, la de planes se muestra igual y viceversa (criterio de
// aceptación 5 — no bloquear la consulta de planes).
//
// Solo llegan aquí socios con `memberStatus === 'ACTIVE'` (guard
// `RequireActiveMember`); esta pantalla no decide esa regla, solo la asume.
// El pago (Culqi.js, formulario de tarjeta) es responsabilidad de US-022:
// el botón de pago se deja deshabilitado a propósito (RN-PAG-08 — ningún
// dato de tarjeta interviene en este flujo, criterio de aceptación 8).

import type { UseQueryResult } from '@tanstack/react-query';
import { Badge, Button, Card, CardHeader, ErrorState, PageHeader, Spinner } from '@activa-club/ui';
import type { Member, MembershipPlan } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { useMemberProfileQuery } from '../../members/profile-query';
import { useMembershipPlansQuery } from '../../members/plans-query';
import { formatDate } from '../../lib/format/date';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import {
  MEMBERSHIP_TYPE_DURATION_LABEL,
  MEMBERSHIP_TYPE_LABEL,
} from '../../lib/format/membership-plan';
import {
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from '../../lib/format/member-status';

export function MembershipPage() {
  const profileQuery = useMemberProfileQuery();
  const plansQuery = useMembershipPlansQuery();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mi membresía"
        description="Consulta el estado de tu membresía y los planes disponibles para pagar o renovar."
      />

      <CurrentMembershipCard profileQuery={profileQuery} />

      <PlansSection plansQuery={plansQuery} />
    </div>
  );
}

interface CurrentMembershipCardProps {
  profileQuery: UseQueryResult<Member>;
}

/** Estado de la membresía vigente del socio (criterio de aceptación 5): hasta
 * cuándo está vigente y que pagar un plan extiende esa vigencia (RN-PAG-01),
 * sin bloquear la sección de planes si esta consulta falla o tarda. */
function CurrentMembershipCard({ profileQuery }: CurrentMembershipCardProps) {
  return (
    <Card>
      <CardHeader title="Estado de tu membresía" />

      {profileQuery.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner label="Consultando el estado de tu membresía…" />
        </div>
      ) : null}

      {profileQuery.isError ? (
        <ErrorState
          title="No pudimos consultar el estado de tu membresía"
          description={
            profileQuery.error instanceof ApiRequestError
              ? profileQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void profileQuery.refetch()}>Reintentar</Button>}
        />
      ) : null}

      {profileQuery.data ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={MEMBERSHIP_STATUS_BADGE_VARIANT[profileQuery.data.membershipStatus]}>
              {MEMBERSHIP_STATUS_LABELS[profileQuery.data.membershipStatus]}
            </Badge>
            {profileQuery.data.membershipType ? (
              <span className="text-sm text-slate-600">
                Plan actual: {MEMBERSHIP_TYPE_LABEL[profileQuery.data.membershipType]}
              </span>
            ) : null}
          </div>

          {profileQuery.data.membershipEndsAt ? (
            <p className="text-sm text-slate-600">
              Vigente hasta el{' '}
              <strong className="font-medium text-slate-900">
                {formatDate(profileQuery.data.membershipEndsAt)}
              </strong>
              . Pagar un plan extiende tu vigencia a partir de esa fecha.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Aún no tienes una membresía vigente. Elige un plan para activarla.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

interface PlansSectionProps {
  plansQuery: UseQueryResult<MembershipPlan[]>;
}

/** Planes disponibles (criterios de aceptación 1, 3 y 4): precio en soles,
 * etiqueta y duración de la vigencia, tal como los entrega el backend. */
function PlansSection({ plansQuery }: PlansSectionProps) {
  return (
    <section aria-labelledby="planes-disponibles-heading" className="flex flex-col gap-4">
      <h2 id="planes-disponibles-heading" className="text-lg font-semibold text-slate-900">
        Planes disponibles
      </h2>

      {plansQuery.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando los planes de membresía…" />
        </div>
      ) : null}

      {plansQuery.isError ? (
        <ErrorState
          title="No pudimos cargar los planes"
          description={
            plansQuery.error instanceof ApiRequestError
              ? plansQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void plansQuery.refetch()}>Reintentar</Button>}
        />
      ) : null}

      {plansQuery.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {plansQuery.data.map((plan) => (
            <PlanCard key={plan.type} plan={plan} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface PlanCardProps {
  plan: MembershipPlan;
}

function PlanCard({ plan }: PlanCardProps) {
  return (
    <Card compact className="flex flex-col gap-3">
      <CardHeader title={plan.label} description={MEMBERSHIP_TYPE_DURATION_LABEL[plan.type]} />

      <p className="text-2xl font-semibold text-slate-900">
        {formatCentsAsCurrency(plan.amount, plan.currency)}
      </p>

      {plan.type === 'ANNUAL' ? (
        plan.allowsInstallments ? (
          <p className="text-sm text-slate-600">Admite facilidades de pago con tarjeta.</p>
        ) : (
          <p className="text-sm text-slate-500">
            Sin facilidades de pago disponibles por el momento; el pago se realiza en un solo cargo.
          </p>
        )
      ) : null}

      {/* TODO(US-022): habilitar el pago del plan con Culqi.js. Ningún dato de
          tarjeta interviene en esta pantalla (criterio de aceptación 8). */}
      <Button type="button" fullWidth disabled title="Disponible próximamente">
        Pagar este plan
      </Button>
    </Card>
  );
}
