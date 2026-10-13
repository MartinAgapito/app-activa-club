import { Link } from 'react-router-dom';
import { Badge } from '@activa-club/ui';
import { formatCentsAsCurrency } from '../lib/format/currency';
import { formatDateTimeInLima } from '../lib/format/lima-time';
import { useRecentPaymentsQuery } from '../payments/payments-query';
import {
  PAYMENT_STATUS_BADGE_VARIANT,
  PAYMENT_STATUS_LABEL,
  planLabel,
} from '../payments/payment-status';
import { BlockError, BlockLoading } from './BlockState';

/** Resumen de los últimos pagos (`GET /payments?limit=3`, US-050). Tiene su
 * propio estado: si falla, el resto del inicio se muestra igual (US-056,
 * criterio 9). */
export function RecentPaymentsBlock() {
  const query = useRecentPaymentsQuery();

  return (
    <section aria-labelledby="pagos-titulo" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pagos-titulo" className="type-section-title text-ink">
          Últimos pagos
        </h2>
        <Link to="/socio/pagos" className="type-aux font-medium text-action underline">
          Ver historial de pagos
        </Link>
      </div>

      {query.isPending ? <BlockLoading label="Cargando tus últimos pagos…" /> : null}

      {query.isError ? (
        <BlockError
          title="No pudimos cargar tus últimos pagos"
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data && query.data.length === 0 ? (
        <p className="type-body rounded-card border border-dashed border-line-strong bg-surface-card p-5 text-ink-muted">
          Aún no tienes pagos registrados.
        </p>
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {query.data.map((payment) => (
            <li
              key={payment.paymentId}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-card px-4 py-3 shadow-card"
            >
              <div className="min-w-0">
                <p className="type-body font-medium text-ink">{planLabel(payment)}</p>
                <p className="type-aux text-ink-muted">{formatDateTimeInLima(payment.createdAt)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="type-body font-semibold tabular-nums text-ink">
                  {formatCentsAsCurrency(payment.amount, payment.currency)}
                </span>
                <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[payment.paymentStatus]}>
                  {PAYMENT_STATUS_LABEL[payment.paymentStatus]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
