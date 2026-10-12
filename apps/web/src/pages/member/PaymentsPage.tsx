// Mis pagos — historial de pagos propios (US-050, sobre US-025).
//
// Tabla (tarjetas en móvil) con paginación por cursor y panel lateral de
// detalle. Consume `GET /payments` (member: solo los propios, más reciente
// primero, `{ items, nextCursor }`). Solo lectura: sin datos de tarjeta ni
// identificadores de Stripe (RN-PAG-08). El pago/renovación vive en
// `/socio/membresia`.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  DataTable,
  PageHeader,
  buttonVariants,
  type DataTableColumn,
} from '@activa-club/ui';
import type { PaymentSummary } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import { formatDateTimeInLima } from '../../lib/format/lima-time';
import { PaymentDetailPanel } from '../../payments/PaymentDetailPanel';
import {
  PAYMENT_STATUS_BADGE_VARIANT,
  PAYMENT_STATUS_LABEL,
  planLabel,
} from '../../payments/payment-status';
import { PAYMENTS_LIST_QUERY_KEY, useMyPaymentsQuery } from '../../payments/payments-query';

function toLoadErrorMessage(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    if (error.code === 'UNAUTHENTICATED') {
      return {
        message: 'Tu sesión expiró. Inicia sesión nuevamente para ver tus pagos.',
        sessionExpired: true,
      };
    }
    if (error.code === 'NETWORK_ERROR') {
      return {
        message: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
        sessionExpired: false,
      };
    }
  }
  return {
    message: 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
    sessionExpired: false,
  };
}

const columns: DataTableColumn<PaymentSummary>[] = [
  {
    key: 'date',
    header: 'Fecha',
    render: (payment) => formatDateTimeInLima(payment.createdAt),
  },
  {
    key: 'plan',
    header: 'Concepto',
    render: (payment) => <span className="font-semibold">{planLabel(payment)}</span>,
  },
  {
    key: 'amount',
    header: 'Monto',
    align: 'right',
    render: (payment) => (
      <span className="font-display font-semibold tabular-nums">
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

export function PaymentsPage() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const query = useMyPaymentsQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const payments = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const selected = payments.find((payment) => payment.paymentId === selectedId) ?? null;
  const latest = payments[0] ?? null;

  // Cursor inválido o vencido (400): la lista vuelve a la primera página.
  const cursorRejected =
    query.isError && query.error instanceof ApiRequestError && query.error.status === 400;
  useEffect(() => {
    if (cursorRejected) {
      void queryClient.resetQueries({ queryKey: PAYMENTS_LIST_QUERY_KEY });
    }
  }, [cursorRejected, queryClient]);

  const loadError = query.isError && !cursorRejected ? toLoadErrorMessage(query.error) : null;
  // Fallo al cargar otra página con datos ya visibles: aviso en línea.
  const pageError = loadError !== null && payments.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mis pagos"
        description="Consulta lo que pagaste y verifica el estado de cada cobro."
        actions={
          <Button
            type="button"
            variant="secondary"
            isLoading={query.isRefetching && !query.isFetchingNextPage}
            onClick={() => void query.refetch()}
          >
            Actualizar
          </Button>
        }
      />

      {latest ? (
        <section
          aria-label="Último pago"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-card p-4 shadow-card"
        >
          <div>
            <p className="type-aux text-ink-muted">Último pago</p>
            <p className="font-display text-xl font-semibold tabular-nums text-ink">
              {formatCentsAsCurrency(latest.amount, latest.currency)}
            </p>
            <p className="type-aux text-ink-muted">{formatDateTimeInLima(latest.createdAt)}</p>
          </div>
          <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[latest.paymentStatus]}>
            {PAYMENT_STATUS_LABEL[latest.paymentStatus]}
          </Badge>
        </section>
      ) : null}

      <DataTable
        caption="Historial de pagos"
        hideCaption
        columns={columns}
        rows={payments}
        getRowKey={(payment) => payment.paymentId}
        onRowClick={(payment) => setSelectedId(payment.paymentId)}
        getRowLabel={(payment) =>
          `${planLabel(payment)}, ${formatDateTimeInLima(payment.createdAt)}, ${formatCentsAsCurrency(
            payment.amount,
            payment.currency,
          )}, ${PAYMENT_STATUS_LABEL[payment.paymentStatus]}. Abrir detalle`
        }
        isLoading={query.isPending || cursorRejected}
        loadingLabel="Cargando tus pagos…"
        isError={loadError !== null && !pageError}
        errorTitle="No pudimos cargar tus pagos"
        errorDescription={loadError?.message}
        retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
        onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
        emptyTitle="Aún no tienes pagos"
        emptyDescription="Cuando pagues o renueves tu membresía, el cobro aparecerá aquí."
        emptyAction={
          <Link to="/socio/membresia" className={buttonVariants({ variant: 'primary' })}>
            Ir a membresía
          </Link>
        }
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        isLoadingMore={query.isFetchingNextPage}
      />

      {pageError ? (
        <p role="alert" className="text-center text-sm text-status-problem">
          {loadError.message}
        </p>
      ) : null}

      <PaymentDetailPanel payment={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
