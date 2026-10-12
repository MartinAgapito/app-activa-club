import { Link } from 'react-router-dom';
import { Badge, buttonVariants } from '@activa-club/ui';
import type { Member } from '@activa-club/shared-types';
import { formatCentsAsCurrency } from '../lib/format/currency';
import { formatDate } from '../lib/format/date';
import {
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from '../lib/format/member-status';
import { MEMBERSHIP_TYPE_LABEL } from '../lib/format/membership-plan';
import { useMemberProfileQuery } from '../members/profile-query';
import { useLatestPaymentQuery } from '../payments/payments-query';
import { BlockError, BlockLoading } from './BlockState';
import { daysLabel, summarizeMembership } from './membership-summary';
import { useNow } from './useNow';

/** "Pase" de membresía: tipo, estado, vigencia, saldo pendiente y acción
 * contextual. Fuente: `GET /members/me` (US-056 la cambiará a
 * `GET /dashboard/member`). El último pago es opcional: si falla, se omite. */
export function MembershipPassBlock() {
  const profileQuery = useMemberProfileQuery();
  const paymentQuery = useLatestPaymentQuery();
  const now = useNow();
  const member = profileQuery.data;

  return (
    <section
      aria-labelledby="pase-titulo"
      className="rounded-card bg-action p-5 text-ink-on-brand shadow-card sm:p-6"
    >
      <h2 id="pase-titulo" className="type-card-title mb-3">
        Mi membresía
      </h2>

      {profileQuery.isPending ? <BlockLoading label="Consultando tu membresía…" /> : null}

      {profileQuery.isError ? (
        <BlockError
          tone="dark"
          title="No pudimos consultar tu membresía"
          onRetry={() => void profileQuery.refetch()}
        />
      ) : null}

      {member ? (
        <PassContent
          member={member}
          now={now}
          verifying={paymentQuery.data?.paymentStatus === 'PENDING_CONFIRMATION'}
        />
      ) : null}
    </section>
  );
}

function PassContent({
  member,
  now,
  verifying,
}: {
  member: Member;
  now: Date;
  verifying: boolean;
}) {
  const summary = summarizeMembership(member, now);
  const { daysLeft } = summary;
  const live = member.membershipStatus === 'ACTIVE' || member.membershipStatus === 'EXPIRING_SOON';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={MEMBERSHIP_STATUS_BADGE_VARIANT[member.membershipStatus]}>
          {MEMBERSHIP_STATUS_LABELS[member.membershipStatus]}
        </Badge>
        {member.membershipType ? (
          <span className="type-body font-medium">
            Plan {MEMBERSHIP_TYPE_LABEL[member.membershipType].toLowerCase()}
          </span>
        ) : null}
      </div>

      <div>
        {live && daysLeft !== null && daysLeft >= 0 ? (
          <p className="type-figure tabular-nums">{daysLabel(daysLeft)}</p>
        ) : null}
        {member.membershipEndsAt ? (
          <p className="type-body opacity-90">
            {member.membershipStatus === 'EXPIRED' ? 'Venció el ' : 'Vigente hasta el '}
            <strong className="font-semibold">{formatDate(member.membershipEndsAt)}</strong>
          </p>
        ) : (
          <p className="type-body opacity-90">Aún no tienes una vigencia registrada.</p>
        )}
      </div>

      {member.outstandingBalance > 0 ? (
        <p className="type-body">
          Saldo pendiente:{' '}
          <strong className="type-card-title tabular-nums">
            {formatCentsAsCurrency(member.outstandingBalance, 'PEN')}
          </strong>
        </p>
      ) : null}

      {verifying ? (
        <p className="type-aux rounded-control bg-white/10 px-3 py-2">
          <strong className="font-semibold">Pago en verificación.</strong> Estamos confirmando tu
          último pago.
        </p>
      ) : null}

      {summary.actionLabel ? (
        <Link
          to="/socio/membresia"
          className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
        >
          {summary.actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
