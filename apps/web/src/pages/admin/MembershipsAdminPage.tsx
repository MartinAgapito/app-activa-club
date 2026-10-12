// Pagos de los socios — US-053 (RN-ADM-07, RN-ADM-03, RN-PAG-08).
//
// Planes vigentes (`GET /memberships/plans`) + consulta de pagos
// (`GET /payments`, `GET /payments/{paymentId}`, docs/api/contratos-api.md §5).
// El servidor exige al menos `memberId` o `status`: la pantalla nunca consulta
// sin filtro. Por defecto muestra los pagos rechazados y en verificación (dos
// consultas por estado, mezcladas del más reciente al más antiguo). El socio
// se filtra por DNI exacto (`GET /members/lookup?dni=`). Filtros y panel viven
// en la URL: `?estado=`, `?socio=<memberId>` y `?pago=<paymentId>`.
//
// El contrato no trae nombre del socio, motivo de rechazo ni renovación
// automática en el pago, ni permite filtrar por rango de fechas.

import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
  type DataTableColumn,
} from '@activa-club/ui';
import type { PaymentStatus, PaymentSummary } from '@activa-club/shared-types';
import { dniSchema } from '@activa-club/validation';
import { PaymentDetailDrawer } from '../../admin/payments/PaymentDetailDrawer';
import { useAdminPaymentsQuery } from '../../admin/payments/admin-payments-query';
import { useMembershipPlansQuery } from '../../members/plans-query';
import { PAYMENT_STATUS_BADGE_VARIANT, PAYMENT_STATUS_LABEL } from '../../payments/payment-status';
import { lookupMemberByDni } from '../../reservations/reservations-client';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import { formatDateTimeInLima } from '../../lib/format/lima-time';
import { MEMBERSHIP_TYPE_LABEL } from '../../lib/format/membership-plan';

const SELECT_CLASS =
  'mt-1 block min-h-11 w-full rounded-control border border-line-strong bg-surface-card px-3 text-sm text-ink focus-ring';

type StatusFilter = 'attention' | PaymentStatus | 'todos';

const STATUS_FILTER_VALUES: ReadonlyArray<StatusFilter> = [
  'attention',
  'FAILED',
  'PENDING_CONFIRMATION',
  'SUCCEEDED',
  'todos',
];

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  attention: 'Rechazados y en verificación',
  FAILED: PAYMENT_STATUS_LABEL.FAILED + 's',
  PENDING_CONFIRMATION: PAYMENT_STATUS_LABEL.PENDING_CONFIRMATION,
  SUCCEEDED: PAYMENT_STATUS_LABEL.SUCCEEDED + 's',
  todos: 'Todos los estados',
};

const LOAD_ERROR = 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.';

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** Id corto para mostrar cuando no se conoce el nombre del socio. */
function shortId(memberId: string): string {
  return `…${memberId.slice(-6)}`;
}

export function MembershipsAdminPage() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get('socio') ?? '';
  const openPaymentId = params.get('pago');
  const rawStatus = params.get('estado');

  // Sin `estado`: "Rechazados y en verificación"; si hay socio, todos sus pagos.
  const status: StatusFilter =
    STATUS_FILTER_VALUES.find((value) => value === rawStatus) ?? (memberId ? 'todos' : 'attention');

  // Nombre del socio resuelto en esta pantalla por DNI (no viene en el pago).
  const [resolved, setResolved] = useState<{ memberId: string; name: string } | null>(null);
  const [dni, setDni] = useState('');
  const [dniError, setDniError] = useState<string | null>(null);
  const memberName = resolved && resolved.memberId === memberId ? resolved.name : null;

  const plansQuery = useMembershipPlansQuery();

  const lookup = useMutation({
    mutationFn: (value: string) => lookupMemberByDni(value),
    onSuccess: (member) => {
      setResolved({
        memberId: member.memberId,
        name: `${member.firstName} ${member.lastName}`,
      });
      setDniError(null);
      update({ socio: member.memberId, pago: null });
    },
    onError: (error: unknown) => {
      setDniError(
        error instanceof ApiRequestError && error.code === 'DNI_NOT_FOUND'
          ? 'No encontramos un socio con ese DNI. Los socios con solicitud pendiente o rechazada no se pueden buscar por DNI.'
          : errorText(error, 'No pudimos buscar al socio. Intenta nuevamente.'),
      );
    },
  });

  function update(changes: Record<string, string | null>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  // Estados a consultar: dos para "atención", uno para el resto.
  const first: PaymentStatus | undefined =
    status === 'attention' ? 'FAILED' : status === 'todos' ? undefined : status;
  const second: PaymentStatus | undefined =
    status === 'attention' ? 'PENDING_CONFIRMATION' : undefined;
  const hasRequiredFilter = status !== 'todos' || memberId !== '';

  const queryA = useAdminPaymentsQuery(
    { memberId: memberId || undefined, status: first },
    hasRequiredFilter,
  );
  const queryB = useAdminPaymentsQuery(
    { memberId: memberId || undefined, status: second },
    hasRequiredFilter && second !== undefined,
  );
  const queries = second ? [queryA, queryB] : [queryA];

  const payments = useMemo(() => {
    const items = queries.flatMap((query) => query.data?.pages.flatMap((page) => page.items) ?? []);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryA.data, queryB.data, second]);

  const isLoading = queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);
  const hasMore = queries.some((query) => query.hasNextPage);
  const isLoadingMore = queries.some((query) => query.isFetchingNextPage);

  function loadMore() {
    for (const query of queries) {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    }
  }

  function submitDni(event: FormEvent) {
    event.preventDefault();
    const parsed = dniSchema.safeParse(dni);
    if (!parsed.success) {
      setDniError(parsed.error.issues[0]?.message ?? 'El DNI debe tener 8 dígitos.');
      return;
    }
    setDniError(null);
    lookup.mutate(parsed.data);
  }

  function clearMember() {
    setDni('');
    setDniError(null);
    setResolved(null);
    update({ socio: null, pago: null });
  }

  const columns: ReadonlyArray<DataTableColumn<PaymentSummary>> = [
    {
      key: 'createdAt',
      header: 'Fecha (Lima)',
      render: (payment) => (
        <span className="tabular-nums">{formatDateTimeInLima(payment.createdAt)}</span>
      ),
    },
    {
      key: 'member',
      header: 'Socio',
      render: (payment) =>
        resolved && resolved.memberId === payment.memberId ? (
          <span className="font-semibold text-ink">{resolved.name}</span>
        ) : (
          <span className="font-mono text-xs text-ink-muted" title={payment.memberId}>
            {shortId(payment.memberId)}
          </span>
        ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (payment) => MEMBERSHIP_TYPE_LABEL[payment.membershipType],
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      render: (payment) => (
        <span className="tabular-nums">
          {formatCentsAsCurrency(payment.amount, payment.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (payment) => (
        <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[payment.paymentStatus]}>
          {PAYMENT_STATUS_LABEL[payment.paymentStatus]}
        </Badge>
      ),
    },
  ];

  const hasActiveFilters = memberId !== '' || status !== 'attention';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pagos"
        description="Consulta los pagos de los socios para atender reclamos y verificar un cobro."
      />

      <section aria-label="Planes vigentes">
        <Card compact>
          <h2 className="type-card-title text-ink">Planes vigentes</h2>
          {plansQuery.isPending ? (
            <div className="mt-3">
              <Spinner label="Cargando planes…" />
            </div>
          ) : plansQuery.isError ? (
            <p role="alert" className="mt-3 text-sm text-status-problem">
              No pudimos cargar los planes.{' '}
              <button type="button" className="underline" onClick={() => void plansQuery.refetch()}>
                Reintentar
              </button>
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {plansQuery.data.map((plan) => (
                <li
                  key={plan.type}
                  className="flex items-baseline justify-between rounded-control border border-line px-4 py-3"
                >
                  <span className="text-sm font-medium text-ink">
                    {MEMBERSHIP_TYPE_LABEL[plan.type]}
                  </span>
                  <span className="text-base font-semibold tabular-nums text-ink">
                    {formatCentsAsCurrency(plan.amount, plan.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section aria-label="Pagos de los socios" className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Elige un estado o busca a un socio por su DNI; no se listan todos los pagos sin filtro.
          Por defecto se muestran los rechazados y en verificación.
        </p>

        <Card compact>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="payments-status" className="text-sm font-medium text-ink">
                Estado
              </label>
              <select
                id="payments-status"
                value={status}
                onChange={(event) => update({ estado: event.target.value, pago: null })}
                className={SELECT_CLASS}
              >
                {STATUS_FILTER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_FILTER_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <form
              aria-label="Buscar socio por DNI"
              noValidate
              onSubmit={submitDni}
              className="flex items-end gap-2"
            >
              <div className="flex-1">
                <Input
                  label="DNI del socio"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={dni}
                  onChange={(event) => setDni(event.target.value.replace(/\D/g, ''))}
                  errorMessage={dniError ?? undefined}
                />
              </div>
              <Button type="submit" variant="secondary" isLoading={lookup.isPending}>
                Buscar
              </Button>
            </form>
          </div>

          {memberId ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
              Socio: <span className="font-semibold">{memberName ?? shortId(memberId)}</span>
              <Button type="button" variant="ghost" onClick={clearMember}>
                Quitar socio
              </Button>
            </p>
          ) : null}
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-2"
              onClick={() => {
                clearMember();
                update({ estado: null });
              }}
            >
              Restablecer filtros
            </Button>
          ) : null}
        </Card>

        {!hasRequiredFilter ? (
          <EmptyState
            title="Elige un estado o busca un socio"
            description='Para ver "Todos los estados" necesitas indicar el DNI de un socio.'
          />
        ) : (
          <DataTable
            caption="Pagos de los socios, del más reciente al más antiguo"
            columns={columns}
            rows={payments}
            getRowKey={(payment) => payment.paymentId}
            onRowClick={(payment) => update({ pago: payment.paymentId })}
            getRowLabel={(payment) =>
              `Ver detalle del pago del ${formatDateTimeInLima(payment.createdAt)}`
            }
            isLoading={isLoading}
            loadingLabel="Cargando pagos…"
            isError={Boolean(failed)}
            errorTitle="No pudimos cargar los pagos"
            errorDescription={errorText(failed?.error, LOAD_ERROR)}
            onRetry={() => queries.forEach((query) => query.isError && void query.refetch())}
            emptyTitle="No hay pagos con este filtro"
            emptyDescription="Prueba con otro estado u otro socio."
            hasMore={hasMore}
            onLoadMore={loadMore}
            isLoadingMore={isLoadingMore}
          />
        )}
      </section>

      <PaymentDetailDrawer
        paymentId={openPaymentId}
        listItem={payments.find((payment) => payment.paymentId === openPaymentId)}
        memberName={
          resolved &&
          payments.find((p) => p.paymentId === openPaymentId)?.memberId === resolved.memberId
            ? resolved.name
            : null
        }
        onClose={() => update({ pago: null })}
        onFilterByMember={(id) => update({ socio: id, estado: 'todos', pago: null })}
      />
    </div>
  );
}
