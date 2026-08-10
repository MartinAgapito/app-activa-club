// Checkout de pago de membresía — US-022 (docs/api/contratos-api.md §5,
// ADR-0011, RN-PAG-01/04/05/08, RN-ACT-07), US-023 (renovación automática) y
// US-037 (migración de la pasarela de Culqi a Stripe test mode).
//
// Accesible desde dos puntos (criterios 1 y 2 de US-022):
// - `MembershipPage` ("Pagar este plan" de un plan concreto): llega con
//   `?plan=<MembershipType>` ya elegido.
// - `PendingApprovalPage` (socio `APPROVED`, "callejón sin salida" del
//   Sprint 1): llega sin plan elegido, así que primero lo elige acá mismo.
//
// No usa `MemberLayout` (igual que `PendingApprovalPage`/`ActivationPage`):
// un socio `APPROVED` todavía no puede entrar a `/socio/*`, así que esta
// pantalla vive fuera de `RequireActiveMember` (ver routes/router.tsx),
// protegida solo por `RequireRole allow={['member']}`.
//
// Tokenización de tarjeta: exclusivamente con Stripe.js/Elements
// (./payments/stripe.ts) usando la llave publicable
// (`VITE_STRIPE_PUBLISHABLE_KEY`, US-037/ADR-0011). Ningún dato de tarjeta
// pasa por el estado de este componente ni por `POST /payments`
// (RN-PAG-08): solo se envía `membershipType`, `stripePaymentMethodId`,
// `idempotencyKey` (criterio 4 de US-022) y `autoRenew` (criterio 6 de
// US-023 — alternativa al toggle standalone de `MembershipPage`, con el
// mismo texto honesto: activarla solo guarda la preferencia, ningún cobro
// automático desatendido se ejecuta todavía). `autoRenew` solo queda
// autorizada de verdad si el pago se confirma (criterio 10 de US-023,
// RN-PAG-07); esa regla la aplica el backend, no esta pantalla.
//
// `idempotencyKey`: se genera una vez por intento de compra (al entrar a la
// pantalla) y se reutiliza mientras ese intento siga en curso — incluido un
// doble clic en "Pagar" (criterio 5/6, protegido además con un `ref` de
// single-flight en `PaymentForm` para no depender solo del re-render de
// React). Un intento nuevo y deliberado (reintentar tras un `PAYMENT_FAILED`
// con otra tarjeta) genera una `idempotencyKey` nueva: reutilizar la misma
// llevaría al backend a devolver `PAYMENT_DUPLICATE` con el resultado
// `FAILED` ya persistido (`apps/api/src/payments/idempotency.ts`),
// bloqueando cualquier reintento real.
//
// Carga de Stripe.js: se dispara una única vez al montar la pantalla (no al
// hacer clic en "Pagar"), para poder mostrar un error explícito y no
// habilitar ningún envío si la llave publicable no está configurada o el
// script no llega a cargar (bloqueado por un adblocker, sin red — caso
// alternativo de la historia), en vez de descubrirlo recién al intentar
// pagar (criterio 15 de US-037).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Stripe, StripeCardElementOptions } from '@stripe/stripe-js';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardHeader,
  ErrorState,
  Spinner,
} from '@activa-club/ui';
import type { MembershipPlan, MembershipType } from '@activa-club/shared-types';
import { useMembershipPlansQuery } from '../../members/plans-query';
import { MEMBER_PROFILE_QUERY_KEY } from '../../members/profile-query';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import { formatDate } from '../../lib/format/date';
import {
  MEMBERSHIP_TYPE_DURATION_LABEL,
  MEMBERSHIP_TYPE_LABEL,
} from '../../lib/format/membership-plan';
import {
  createStripePaymentMethod,
  loadStripeClient,
  StripePaymentError,
} from '../../payments/stripe';
import { createPayment } from '../../payments/payments-client';
import {
  toErrorOutcome,
  toSuccessOutcome,
  type PaymentOutcome,
} from '../../payments/payment-outcome';
import { useAuth } from '../../auth/AuthContext';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

const GENERIC_CARD_ERROR_MESSAGE = 'No se pudo procesar la tarjeta. Intenta nuevamente.';

const CARD_ELEMENT_OPTIONS: StripeCardElementOptions = {
  hidePostalCode: true,
  style: {
    base: {
      fontSize: '14px',
      color: '#0f172a',
      fontFamily: 'inherit',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: { color: '#b91c1c' },
  },
};

const VALID_MEMBERSHIP_TYPES: readonly MembershipType[] = ['MONTHLY', 'ANNUAL'];

function isMembershipType(value: string | null): value is MembershipType {
  return value !== null && (VALID_MEMBERSHIP_TYPES as readonly string[]).includes(value);
}

type StripeReadiness =
  | { status: 'loading' }
  | { status: 'ready'; stripe: Stripe }
  | { status: 'error'; message: string };

export function CheckoutPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const plansQuery = useMembershipPlansQuery();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const preselectedType = searchParams.get('plan');
  const selectedPlan = useMemo(() => {
    if (!plansQuery.data || !isMembershipType(preselectedType)) return null;
    return plansQuery.data.find((plan) => plan.type === preselectedType) ?? null;
  }, [plansQuery.data, preselectedType]);

  // Un intento de compra = una `idempotencyKey`. Se regenera únicamente al
  // iniciar un intento explícitamente nuevo (elegir otro plan, o reintentar
  // tras un `PAYMENT_FAILED`), nunca en un reintento del mismo click.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null);
  // US-023, criterio 6: desactivada por defecto en cada intento nuevo — un
  // socio nunca queda autorizado sin marcarla explícitamente (RN-PAG-03).
  const [autoRenew, setAutoRenewChoice] = useState(false);

  const [stripeReadiness, setStripeReadiness] = useState<StripeReadiness>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadStripeClient(STRIPE_PUBLISHABLE_KEY)
      .then((stripe) => {
        if (!cancelled) setStripeReadiness({ status: 'ready', stripe });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStripeReadiness({
          status: 'error',
          message: error instanceof StripePaymentError ? error.message : GENERIC_CARD_ERROR_MESSAGE,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const paymentMutation = useMutation({ mutationFn: createPayment });

  function choosePlan(type: MembershipType) {
    setOutcome(null);
    setIdempotencyKey(crypto.randomUUID());
    setAutoRenewChoice(false);
    setSearchParams({ plan: type });
  }

  function startNewAttempt() {
    setOutcome(null);
    setIdempotencyKey(crypto.randomUUID());
    setAutoRenewChoice(false);
  }

  async function submitPayment(stripePaymentMethodId: string) {
    if (!selectedPlan) return;
    try {
      const response = await paymentMutation.mutateAsync({
        membershipType: selectedPlan.type,
        stripePaymentMethodId,
        idempotencyKey,
        autoRenew,
      });
      setOutcome(toSuccessOutcome(response));
      if (response.paymentStatus === 'SUCCEEDED') {
        // Criterio 7: el socio puede entrar a /socio sin volver a iniciar
        // sesión — se invalida el perfil cacheado (RequireActiveMember,
        // ProfilePage, PendingApprovalPage comparten esta misma queryKey).
        await queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY });
      }
    } catch (error) {
      const nextOutcome = toErrorOutcome(error);
      setOutcome(nextOutcome);
      if (error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') {
        // Criterio 11 / caso alternativo "sesión expirada al confirmar": no
        // se asume ningún cobro; se cierra la sesión localmente para que el
        // guard de rutas (RequireRole) redirija a /login.
        signOut();
      }
    }
  }

  if (plansQuery.isPending) {
    return (
      <CenteredCard>
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando los planes de membresía…" />
        </div>
      </CenteredCard>
    );
  }

  if (plansQuery.isError) {
    return (
      <CenteredCard>
        <ErrorState
          title="No pudimos cargar los planes"
          description={
            plansQuery.error instanceof ApiRequestError
              ? plansQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void plansQuery.refetch()}>Reintentar</Button>}
        />
      </CenteredCard>
    );
  }

  const plans = plansQuery.data;
  if (!plans) {
    // Defensivo: no debería alcanzarse (isPending/isError ya cubiertos arriba).
    return null;
  }

  if (!selectedPlan) {
    return (
      <CenteredCard wide>
        <CardHeader
          title="Elige un plan para pagar"
          description="Selecciona el plan de membresía que quieres pagar (RN-PAG-01)."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <SelectablePlanCard
              key={plan.type}
              plan={plan}
              onSelect={() => choosePlan(plan.type)}
            />
          ))}
        </div>
        <BackToMembershipLink className="mt-6" />
      </CenteredCard>
    );
  }

  if (outcome) {
    return (
      <CenteredCard>
        <OutcomeView
          outcome={outcome}
          onRetry={startNewAttempt}
          onChooseAnotherPlan={() => {
            setOutcome(null);
            setSearchParams({});
          }}
        />
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <CardHeader
        title="Pagar membresía"
        description="El pago se procesa con tarjeta a través de Stripe (RN-PAG-05): no ofrecemos efectivo, Yape, Plin ni transferencias."
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-slate-900">
            Plan {MEMBERSHIP_TYPE_LABEL[selectedPlan.type]}
          </span>
          <Badge variant="info">{MEMBERSHIP_TYPE_DURATION_LABEL[selectedPlan.type]}</Badge>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {formatCentsAsCurrency(selectedPlan.amount, selectedPlan.currency)}
        </p>
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <input
          type="checkbox"
          checked={autoRenew}
          onChange={(event) => setAutoRenewChoice(event.target.checked)}
          disabled={paymentMutation.isPending}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
        <span className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">Autorizar la renovación automática.</span>{' '}
          Guardamos tu autorización para renovar tu membresía; por ahora esto solo registra tu
          preferencia, todavía no ejecutamos ningún cobro automático sin que vuelvas a confirmarlo.
          Podés desactivarla cuando quieras desde tu membresía.
        </span>
      </label>

      {stripeReadiness.status === 'ready' ? (
        <Elements stripe={stripeReadiness.stripe}>
          <PaymentForm
            isPaymentMutationPending={paymentMutation.isPending}
            onSubmit={submitPayment}
          />
        </Elements>
      ) : stripeReadiness.status === 'loading' ? (
        <div className="mt-4 flex justify-center py-2">
          <Spinner size="md" label="Cargando la pasarela de pago…" />
        </div>
      ) : (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {stripeReadiness.message}
        </p>
      )}

      <p className="mt-3 text-center text-xs text-slate-500">
        Tus datos de tarjeta se procesan de forma segura con Stripe. Activa Club nunca recibe ni
        almacena el número completo de tu tarjeta.
      </p>

      <BackToMembershipLink className="mt-6" />
    </CenteredCard>
  );
}

interface PaymentFormProps {
  isPaymentMutationPending: boolean;
  onSubmit: (stripePaymentMethodId: string) => Promise<void>;
}

/** Formulario del Card Element de Stripe. Vive dentro de un `<Elements>`
 * provider (ver `CheckoutPage`), única forma de usar `useStripe`/`useElements`. */
function PaymentForm({ isPaymentMutationPending, onSubmit }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const isSubmittingRef = useRef(false);
  const [isCreatingPaymentMethod, setIsCreatingPaymentMethod] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const isProcessing = isCreatingPaymentMethod || isPaymentMutationPending;

  async function handlePay() {
    if (!stripe || !elements || isSubmittingRef.current) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setCardError(GENERIC_CARD_ERROR_MESSAGE);
      return;
    }

    isSubmittingRef.current = true;
    setCardError(null);
    setIsCreatingPaymentMethod(true);

    let stripePaymentMethodId: string;
    try {
      stripePaymentMethodId = await createStripePaymentMethod({ stripe, cardElement });
    } catch (error) {
      setIsCreatingPaymentMethod(false);
      isSubmittingRef.current = false;
      setCardError(
        error instanceof StripePaymentError ? error.message : GENERIC_CARD_ERROR_MESSAGE,
      );
      return;
    }
    setIsCreatingPaymentMethod(false);

    try {
      await onSubmit(stripePaymentMethodId);
    } finally {
      isSubmittingRef.current = false;
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-1.5">
        <span id="card-element-label" className="text-sm font-medium text-slate-700">
          Datos de la tarjeta
        </span>
        <div
          role="group"
          aria-labelledby="card-element-label"
          className="rounded-lg border border-slate-300 bg-white px-3 py-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500"
        >
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        {cardError ? (
          <p role="alert" className="text-sm text-danger-600">
            {cardError}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        fullWidth
        className="mt-4"
        variant="positive"
        isLoading={isProcessing}
        disabled={isProcessing || !stripe || !elements}
        onClick={() => void handlePay()}
      >
        {isProcessing ? 'Procesando pago…' : 'Pagar con tarjeta'}
      </Button>
    </>
  );
}

function CenteredCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>{children}</Card>
    </div>
  );
}

function BackToMembershipLink({ className }: { className?: string }) {
  return (
    <p className={`text-center text-sm ${className ?? ''}`}>
      <Link to="/socio/membresia" className="font-medium text-brand-700 hover:text-brand-900">
        Volver a mi membresía
      </Link>
    </p>
  );
}

interface SelectablePlanCardProps {
  plan: MembershipPlan;
  onSelect: () => void;
}

function SelectablePlanCard({ plan, onSelect }: SelectablePlanCardProps) {
  return (
    <Card compact className="flex flex-col gap-3">
      <CardHeader title={plan.label} description={MEMBERSHIP_TYPE_DURATION_LABEL[plan.type]} />
      <p className="text-2xl font-semibold text-slate-900">
        {formatCentsAsCurrency(plan.amount, plan.currency)}
      </p>
      <Button type="button" fullWidth onClick={onSelect}>
        Elegir este plan
      </Button>
    </Card>
  );
}

interface OutcomeViewProps {
  outcome: PaymentOutcome;
  onRetry: () => void;
  onChooseAnotherPlan: () => void;
}

function OutcomeView({ outcome, onRetry, onChooseAnotherPlan }: OutcomeViewProps) {
  if (outcome.status === 'SUCCEEDED') {
    return (
      <div role="status">
        <CardHeader title="Pago confirmado" description="Tu membresía ya está activa." />
        <div className="rounded-xl border border-positive-200 bg-positive-50 p-4 text-sm text-positive-800">
          <p>
            Plan: <strong>{MEMBERSHIP_TYPE_LABEL[outcome.response.membershipType]}</strong>
          </p>
          <p className="mt-1">
            Monto pagado:{' '}
            <strong>
              {formatCentsAsCurrency(outcome.response.amount, outcome.response.currency)}
            </strong>
          </p>
          {outcome.response.membershipEndsAt ? (
            <p className="mt-1">
              Vigente hasta: <strong>{formatDate(outcome.response.membershipEndsAt)}</strong>
            </p>
          ) : null}
        </div>
        <Link to="/socio" className={buttonVariants({ fullWidth: true, className: 'mt-6' })}>
          Ir a mi área de socio
        </Link>
      </div>
    );
  }

  if (outcome.status === 'PENDING_CONFIRMATION') {
    return (
      <div role="status">
        <CardHeader
          title="Tu pago está en verificación"
          description="Todavía no confirmamos el resultado con la pasarela de pago."
        />
        <p className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          No prometemos la activación todavía: te avisaremos por notificación en cuanto se confirme.
          Podrás revisar el detalle desde tu historial de pagos.
        </p>
        <BackToMembershipLink className="mt-6" />
      </div>
    );
  }

  if (outcome.status === 'FAILED') {
    return (
      <div role="alert">
        <CardHeader title="No pudimos procesar tu pago" />
        <p className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          {outcome.message}
        </p>
        <Button type="button" fullWidth className="mt-6" onClick={onRetry}>
          Intentar con otra tarjeta
        </Button>
        <button
          type="button"
          onClick={onChooseAnotherPlan}
          className="mt-3 block w-full text-center text-sm font-medium text-brand-700 hover:text-brand-900"
        >
          Elegir otro plan
        </button>
      </div>
    );
  }

  if (outcome.status === 'DUPLICATE') {
    return (
      <div role="status">
        <CardHeader title="Este pago ya fue procesado" />
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Ya existe un resultado para este intento de pago
          {outcome.paymentStatus ? ` (estado: ${outcome.paymentStatus}).` : '.'} No generamos un
          cobro nuevo.
        </p>
        <BackToMembershipLink className="mt-6" />
      </div>
    );
  }

  if (outcome.status === 'MEMBER_NOT_APPROVED') {
    return (
      <div role="alert">
        <CardHeader title="Tu cuenta todavía no puede pagar" />
        <p className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          {outcome.message}
        </p>
        <Link
          to="/cuenta/pendiente-aprobacion"
          className={buttonVariants({ fullWidth: true, className: 'mt-6' })}
        >
          Ver el estado de mi cuenta
        </Link>
      </div>
    );
  }

  if (outcome.status === 'VALIDATION_ERROR') {
    return (
      <div role="alert">
        <CardHeader title="Revisa los datos del pago" />
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          <p>{outcome.message}</p>
          {outcome.details.length > 0 ? (
            <ul className="mt-2 list-inside list-disc">
              {outcome.details.map((detail) => (
                <li key={detail.field}>{detail.issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button type="button" fullWidth className="mt-6" onClick={onRetry}>
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  if (outcome.status === 'UNAUTHENTICATED') {
    return (
      <div role="alert">
        <CardHeader title="Tu sesión expiró" />
        <p className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          No se realizó ningún cobro. Inicia sesión nuevamente para continuar.
        </p>
      </div>
    );
  }

  return (
    <div role="alert">
      <CardHeader title="No pudimos procesar tu pago" />
      <p className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        {outcome.message}
      </p>
      <Button type="button" fullWidth className="mt-6" onClick={onRetry}>
        Intentar de nuevo
      </Button>
      <BackToMembershipLink className="mt-4" />
    </div>
  );
}
