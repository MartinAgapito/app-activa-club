import { Link } from 'react-router-dom';
import { Badge, buttonVariants } from '@activa-club/ui';
import type { MemberDashboard } from '@activa-club/shared-types';
import { formatCentsAsCurrency } from '../lib/format/currency';
import {
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from '../lib/format/member-status';
import { MEMBERSHIP_TYPE_LABEL } from '../lib/format/membership-plan';
import { useRecentPaymentsQuery } from '../payments/payments-query';
import {
  daysLabel,
  formatMembershipEnd,
  membershipAction,
  noMembershipMessage,
} from './member-dashboard-view';

/** "Pase" de membresía: tipo, estado, vencimiento, saldo pendiente y acción
 * contextual. Fuente: `GET /dashboard/member`. El aviso de pago en
 * verificación sale de los últimos pagos y es opcional: si falla, se omite. */
export function MembershipPassBlock({ dashboard }: { dashboard: MemberDashboard }) {
  const paymentsQuery = useRecentPaymentsQuery();
  const verifying = paymentsQuery.data?.[0]?.paymentStatus === 'PENDING_CONFIRMATION';
  const { membership } = dashboard;
  const { label } = membershipAction(dashboard);
  const live = membership.status === 'ACTIVE' || membership.status === 'EXPIRING_SOON';
  const endsAt = formatMembershipEnd(membership.endsAt);

  return (
    <section
      aria-labelledby="pase-titulo"
      className="rounded-card bg-action p-5 text-ink-on-brand shadow-card sm:p-6"
    >
      <h2 id="pase-titulo" className="type-card-title mb-3">
        Mi membresía
      </h2>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={MEMBERSHIP_STATUS_BADGE_VARIANT[membership.status]}>
            {MEMBERSHIP_STATUS_LABELS[membership.status]}
          </Badge>
          {membership.type ? (
            <span className="type-body font-medium">
              Plan {MEMBERSHIP_TYPE_LABEL[membership.type].toLowerCase()}
            </span>
          ) : null}
        </div>

        <div>
          {live && membership.daysRemaining !== null ? (
            <p className="type-figure tabular-nums">{daysLabel(membership.daysRemaining)}</p>
          ) : null}
          {endsAt ? (
            <p className="type-body opacity-90">
              {membership.status === 'EXPIRED' ? 'Venció el ' : 'Vigente hasta el '}
              <strong className="font-semibold">{endsAt}</strong>
            </p>
          ) : (
            <p className="type-body opacity-90">
              {membership.status === 'NONE'
                ? noMembershipMessage(dashboard)
                : 'Aún no tienes una vigencia registrada.'}
            </p>
          )}
        </div>

        {membership.outstandingBalance > 0 ? (
          <p className="type-body">
            Saldo pendiente:{' '}
            <strong className="type-card-title tabular-nums">
              {formatCentsAsCurrency(membership.outstandingBalance, 'PEN')}
            </strong>
          </p>
        ) : null}

        {verifying ? (
          <p className="type-aux rounded-control bg-white/10 px-3 py-2">
            <strong className="font-semibold">Pago en verificación.</strong> Estamos confirmando tu
            último pago.
          </p>
        ) : null}

        {label ? (
          <Link
            to="/socio/membresia"
            className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
          >
            {label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
