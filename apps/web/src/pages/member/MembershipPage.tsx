// Mi membresía — US-020 y US-023 (renovación automática).
//
// Consulta los planes de membresía disponibles (`GET /memberships/plans`,
// docs/api/contratos-api.md §5) y el estado de la membresía vigente del
// socio (`GET /members/me`, ya cacheado por `RequireActiveMember` al entrar
// a `/socio/*`). Las dos consultas son independientes: si la del perfil
// falla o tarda, la de planes se muestra igual y viceversa (criterio de
// aceptación 5 de US-020 — no bloquear la consulta de planes).
//
// Solo llegan aquí socios con `memberStatus === 'ACTIVE'` (guard
// `RequireActiveMember`); esta pantalla no decide esa regla, solo la asume.
// Por eso ningún socio `PENDING`/`REJECTED` llega a ver la preferencia de
// renovación automática (US-023, caso alternativo "socio PENDING/REJECTED
// no puede... activar la preferencia"): el guard ya se lo impide.
//
// El pago (Stripe.js/Elements, formulario de tarjeta) es responsabilidad de
// US-022 (migrado a Stripe por US-037)
// (`CheckoutPage`, ruta `/socio/membresia/pagar?plan=<tipo>`): esta pantalla
// solo enlaza al plan elegido, sin tocar ningún dato de tarjeta (RN-PAG-08).
// Renovar reutiliza ese mismo checkout (US-023, criterio 1): no hay un flujo
// de renovación separado.

import { useState } from 'react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Badge,
  buttonVariants,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  Spinner,
} from '@activa-club/ui';
import type { Member, MembershipPlan } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { MEMBER_PROFILE_QUERY_KEY, useMemberProfileQuery } from '../../members/profile-query';
import { useMembershipPlansQuery } from '../../members/plans-query';
import { updateAutoRenew } from '../../members/auto-renew-client';
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

      <AutoRenewCard profileQuery={profileQuery} />

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

interface AutoRenewCardProps {
  profileQuery: UseQueryResult<Member>;
}

/** Preferencia de renovación automática (US-023, criterios de aceptación 5,
 * 6, 7 y 8): muestra el valor real de `autoRenew` que devuelve `GET
 * /members/me` — nunca inferido en el cliente — y permite cambiarlo con una
 * acción explícita e inequívoca (un botón dedicado, nunca un toggle que se
 * dispare por accidente) más una confirmación (`ConfirmDialog`, RN-PAG-07)
 * que explica en lenguaje honesto qué implica: solo guardamos la preferencia,
 * ningún cobro automático desatendido se ejecuta todavía (ver "Alcance de la
 * renovación automática" en la historia). */
function AutoRenewCard({ profileQuery }: AutoRenewCardProps) {
  const queryClient = useQueryClient();
  // `null` = sin diálogo abierto; `true`/`false` = valor que se confirmaría.
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateAutoRenew({ enabled }),
    onSuccess: async (_response, enabled) => {
      setPendingValue(null);
      setFeedback({
        type: 'success',
        text: enabled
          ? 'Activaste la renovación automática. Guardamos tu autorización.'
          : 'Desactivaste la renovación automática.',
      });
      // Criterio 8: el estado se refleja al instante desde el backend, no se
      // asume el nuevo valor en el cliente.
      await queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY });
    },
    onError: (error: unknown) => {
      setPendingValue(null);
      setFeedback({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : 'No se pudo actualizar tu preferencia. Intenta nuevamente.',
      });
    },
  });

  if (profileQuery.isPending) {
    return (
      <Card>
        <CardHeader title="Renovación automática" />
        <div className="flex justify-center py-6">
          <Spinner label="Consultando tu preferencia de renovación automática…" />
        </div>
      </Card>
    );
  }

  if (profileQuery.isError) {
    return (
      <Card>
        <CardHeader title="Renovación automática" />
        <ErrorState
          title="No pudimos consultar tu preferencia de renovación automática"
          description={
            profileQuery.error instanceof ApiRequestError
              ? profileQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void profileQuery.refetch()}>Reintentar</Button>}
        />
      </Card>
    );
  }

  const member = profileQuery.data;
  if (!member) {
    return null;
  }

  const isEnabled = member.autoRenew;

  return (
    <Card>
      <CardHeader title="Renovación automática" />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isEnabled ? 'positive' : 'neutral'}>
          {isEnabled ? 'Activada' : 'Desactivada'}
        </Badge>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        {isEnabled
          ? 'Autorizaste la renovación automática de tu membresía. Por ahora esto guarda tu preferencia: todavía no ejecutamos ningún cobro automático sin que vuelvas a confirmarlo.'
          : 'No autorizaste la renovación automática. Vas a necesitar pagar manualmente cada vez que corresponda renovar tu membresía.'}
      </p>

      {feedback ? (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={
            feedback.type === 'success'
              ? 'mt-3 rounded-lg border border-positive-200 bg-positive-50 px-3 py-2 text-sm text-positive-800'
              : 'mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700'
          }
        >
          {feedback.text}
        </p>
      ) : null}

      <Button
        type="button"
        variant={isEnabled ? 'secondary' : 'positive'}
        className="mt-4"
        onClick={() => {
          setFeedback(null);
          setPendingValue(!isEnabled);
        }}
      >
        {isEnabled ? 'Desactivar renovación automática' : 'Activar renovación automática'}
      </Button>

      <ConfirmDialog
        open={pendingValue !== null}
        title={
          pendingValue
            ? '¿Activar la renovación automática?'
            : '¿Desactivar la renovación automática?'
        }
        description={
          pendingValue
            ? 'Guardamos tu autorización para renovar tu membresía automáticamente. Por ahora esto solo registra tu preferencia: no ejecutamos ningún cobro sin que vuelvas a confirmarlo. Podés desactivarla cuando quieras.'
            : 'Ya no vamos a considerar tu autorización para renovar automáticamente. Vas a tener que pagar manualmente la próxima vez que corresponda renovar.'
        }
        confirmLabel={pendingValue ? 'Activar' : 'Desactivar'}
        confirmVariant={pendingValue ? 'positive' : 'danger'}
        isLoading={mutation.isPending}
        onConfirm={() => {
          if (pendingValue !== null) {
            mutation.mutate(pendingValue);
          }
        }}
        onCancel={() => setPendingValue(null)}
      />
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

      <Link
        to={`/socio/membresia/pagar?plan=${plan.type}`}
        className={buttonVariants({ fullWidth: true })}
      >
        Pagar este plan
      </Link>
    </Card>
  );
}
