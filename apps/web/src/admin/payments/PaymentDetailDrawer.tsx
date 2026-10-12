// Panel lateral con el detalle de un pago — US-053 (criterio 5).
//
// Muestra solo lo que expone el contrato (`PaymentSummary`, docs/api/
// contratos-api.md §5): nunca datos de tarjeta, `stripePaymentMethodId` ni
// secretos (RN-PAG-08). La referencia de la pasarela (`stripePaymentIntentId`)
// aparece solo aquí, para buscar el cobro en su panel.

import type { ReactNode } from 'react';
import { Badge, Button, Drawer, ErrorState, Spinner } from '@activa-club/ui';
import type { PaymentSummary } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import { formatDateTimeInLima } from '../../lib/format/lima-time';
import { MEMBERSHIP_TYPE_LABEL } from '../../lib/format/membership-plan';
import { PAYMENT_STATUS_BADGE_VARIANT, PAYMENT_STATUS_LABEL } from '../../payments/payment-status';
import { useAdminPaymentDetailQuery } from './admin-payments-query';

interface PaymentDetailDrawerProps {
  paymentId: string | null;
  /** Fila ya cargada en la lista: se muestra mientras llega el detalle. */
  listItem: PaymentSummary | undefined;
  /** Nombre del socio si se conoce (búsqueda por DNI en esta pantalla). */
  memberName: string | null;
  onClose: () => void;
  onFilterByMember: (memberId: string) => void;
}

export function PaymentDetailDrawer({
  paymentId,
  listItem,
  memberName,
  onClose,
  onFilterByMember,
}: PaymentDetailDrawerProps) {
  const query = useAdminPaymentDetailQuery(paymentId);
  const payment = query.data ?? listItem;

  if (paymentId === null) {
    return null;
  }

  const notFound = query.error instanceof ApiRequestError && query.error.status === 404;

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Detalle del pago"
      description="Información del cobro, sin datos de tarjeta"
    >
      {payment ? (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Item label="Estado">
              <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[payment.paymentStatus]}>
                {PAYMENT_STATUS_LABEL[payment.paymentStatus]}
              </Badge>
            </Item>
            <Item label="Monto">
              <span className="font-semibold tabular-nums">
                {formatCentsAsCurrency(payment.amount, payment.currency)}
              </span>
            </Item>
            <Item label="Plan">{MEMBERSHIP_TYPE_LABEL[payment.membershipType]}</Item>
            <Item label="Socio">
              {memberName ? <span className="font-medium">{memberName}</span> : null}
              <span className="block break-all text-ink-muted">{payment.memberId}</span>
            </Item>
            <Item label="Fecha del pago (hora de Lima)">
              {formatDateTimeInLima(payment.createdAt)}
            </Item>
            <Item label="Fecha de confirmación (hora de Lima)">
              {payment.confirmedAt ? formatDateTimeInLima(payment.confirmedAt) : 'Sin confirmar'}
            </Item>
            <Item label="Identificador del pago" wide>
              <span className="break-all">{payment.paymentId}</span>
            </Item>
            <Item label="Referencia en la pasarela de pagos" wide>
              {payment.stripePaymentIntentId ? (
                <span className="break-all font-mono text-xs">{payment.stripePaymentIntentId}</span>
              ) : (
                'Sin referencia'
              )}
            </Item>
          </dl>

          {payment.paymentStatus === 'FAILED' ? (
            <p className="text-sm text-ink-muted">
              El motivo del rechazo no se muestra aquí; revísalo en la pasarela de pagos con la
              referencia indicada.
            </p>
          ) : null}
          {payment.paymentStatus === 'PENDING_CONFIRMATION' ? (
            <p className="text-sm text-ink-muted">
              La pasarela aún no confirmó este cobro. La confirmación llega de forma automática.
            </p>
          ) : null}

          {query.isError ? (
            <p role="alert" className="text-sm text-status-pending">
              No pudimos actualizar el detalle; se muestran los datos de la lista.
            </p>
          ) : null}

          <Button variant="secondary" onClick={() => onFilterByMember(payment.memberId)}>
            Ver todos los pagos de este socio
          </Button>
        </div>
      ) : query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando el detalle del pago…" />
        </div>
      ) : (
        <ErrorState
          title={notFound ? 'No encontramos este pago' : 'No pudimos cargar este pago'}
          description={
            query.error instanceof ApiRequestError
              ? query.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={
            notFound ? undefined : <Button onClick={() => void query.refetch()}>Reintentar</Button>
          }
        />
      )}
    </Drawer>
  );
}

function Item({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="type-aux text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
