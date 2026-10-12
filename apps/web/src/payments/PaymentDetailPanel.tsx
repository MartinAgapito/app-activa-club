// Panel lateral con el detalle de un pago propio (US-050).
//
// Usa el elemento ya cargado de `GET /payments` (mismo shape que
// `GET /payments/{id}`). No muestra datos de tarjeta ni el identificador de
// Stripe (criterio 7, RN-PAG-08): la referencia es el `paymentId` interno.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Drawer, buttonVariants } from '@activa-club/ui';
import type { PaymentSummary } from '@activa-club/shared-types';
import { formatCentsAsCurrency } from '../lib/format/currency';
import { formatDateTimeInLima } from '../lib/format/lima-time';
import { PAYMENT_STATUS_BADGE_VARIANT, PAYMENT_STATUS_LABEL, planLabel } from './payment-status';

export interface PaymentDetailPanelProps {
  payment: PaymentSummary | null;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="type-aux text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

export function PaymentDetailPanel({ payment, onClose }: PaymentDetailPanelProps) {
  return (
    <Drawer
      open={payment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Detalle del pago"
    >
      {payment ? (
        <div className="flex flex-col gap-4">
          {payment.paymentStatus === 'PENDING_CONFIRMATION' ? (
            <p
              role="status"
              className="rounded-control bg-status-pending-soft p-3 text-sm text-ink"
            >
              Estamos verificando este pago con el procesador. Cuando se confirme, el estado se
              actualizará al recargar la lista.
            </p>
          ) : null}
          {payment.paymentStatus === 'FAILED' ? (
            <div className="flex flex-col items-start gap-3 rounded-control bg-status-problem-soft p-3 text-sm text-ink">
              <p>
                El pago fue rechazado y no se realizó ningún cargo. Puedes intentarlo de nuevo con
                otro medio de pago.
              </p>
              <Link to="/socio/membresia" className={buttonVariants({ variant: 'primary' })}>
                Ir a membresía
              </Link>
            </div>
          ) : null}
          <dl>
            <Field label="Monto">
              <span className="font-display text-lg font-semibold tabular-nums">
                {formatCentsAsCurrency(payment.amount, payment.currency)}
              </span>
            </Field>
            <Field label="Plan">{planLabel(payment)}</Field>
            <Field label="Estado">
              <Badge variant={PAYMENT_STATUS_BADGE_VARIANT[payment.paymentStatus]}>
                {PAYMENT_STATUS_LABEL[payment.paymentStatus]}
              </Badge>
            </Field>
            <Field label="Fecha">{formatDateTimeInLima(payment.createdAt)}</Field>
            {payment.confirmedAt ? (
              <Field label="Confirmado">{formatDateTimeInLima(payment.confirmedAt)}</Field>
            ) : null}
            <Field label="Referencia">
              <span className="break-all font-mono text-xs">{payment.paymentId}</span>
            </Field>
          </dl>
        </div>
      ) : null}
    </Drawer>
  );
}
