// Panel lateral con el detalle de un socio (US-051). Solo lectura.
//
// Contrato: `GET /members/{memberId}` (docs/api/contratos-api.md §4). Una
// solicitud `PENDING` se decide en `/admin/solicitudes`: aquí solo se enlaza.

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Drawer, ErrorState, Spinner } from '@activa-club/ui';
import type { Member } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import { formatDate } from '../../lib/format/date';
import { daysUntilInLima } from '../../lib/format/lima-time';
import { MEMBERSHIP_TYPE_LABEL } from '../../lib/format/membership-plan';
import {
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
  MEMBER_STATUS_BADGE_VARIANT,
  MEMBER_STATUS_LABELS,
} from '../../lib/format/member-status';
import { fetchMemberDetail } from '../pending-members-client';
import { DetailItem, DetailSection } from '../shared/DetailList';
import { MEMBER_ORIGIN_LABELS } from './members-tabs';

function describeDaysLeft(days: number): string {
  if (days === 0) return 'Vence hoy';
  if (days === 1) return '1 día';
  if (days > 1) return `${days} días`;
  const ago = Math.abs(days);
  return ago === 1 ? 'Venció hace 1 día' : `Venció hace ${ago} días`;
}

interface MemberDetailDrawerProps {
  memberId: string | null;
  onClose: () => void;
}

export function MemberDetailDrawer({ memberId, onClose }: MemberDetailDrawerProps) {
  const query = useQuery({
    queryKey: ['members', 'detail', memberId],
    queryFn: () => fetchMemberDetail(memberId as string),
    enabled: memberId !== null,
  });

  if (memberId === null) return null;
  const member = query.data;

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={member ? `${member.firstName} ${member.lastName}` : 'Detalle del socio'}
      description="Situación del socio y de su membresía"
    >
      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando el detalle del socio…" />
        </div>
      ) : query.isError ? (
        <ErrorState
          title="No pudimos cargar este socio"
          description={
            query.error instanceof ApiRequestError
              ? query.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
        />
      ) : member ? (
        <MemberDetailBody member={member} />
      ) : null}
    </Drawer>
  );
}

function MemberDetailBody({ member }: { member: Member }) {
  const hasDebt = member.outstandingBalance > 0;

  return (
    <div className="flex flex-col gap-6">
      <DetailSection title="Datos de contacto">
        <DetailItem label="Correo electrónico">{member.email}</DetailItem>
        <DetailItem label="Teléfono">{member.phone ?? 'No registrado'}</DetailItem>
      </DetailSection>

      <DetailSection title="Cuenta">
        <DetailItem label="DNI">{member.dni}</DetailItem>
        <DetailItem label="Origen">{MEMBER_ORIGIN_LABELS[member.origin]}</DetailItem>
        {member.origin === 'MIGRATED' ? (
          <DetailItem label="Identificador legado">{member.legacyId ?? 'No registrado'}</DetailItem>
        ) : null}
        <DetailItem label="Estado de la cuenta">
          <Badge variant={MEMBER_STATUS_BADGE_VARIANT[member.memberStatus]}>
            {MEMBER_STATUS_LABELS[member.memberStatus]}
          </Badge>
        </DetailItem>
        <DetailItem label="Fecha de alta">{formatDate(member.createdAt)}</DetailItem>
        {member.memberStatus === 'REJECTED' && member.rejectionReason ? (
          <DetailItem label="Motivo de rechazo" wide>
            {member.rejectionReason}
          </DetailItem>
        ) : null}
      </DetailSection>

      <DetailSection title="Membresía">
        <DetailItem label="Estado">
          <Badge variant={MEMBERSHIP_STATUS_BADGE_VARIANT[member.membershipStatus]}>
            {MEMBERSHIP_STATUS_LABELS[member.membershipStatus]}
          </Badge>
        </DetailItem>
        <DetailItem label="Tipo">
          {member.membershipType ? MEMBERSHIP_TYPE_LABEL[member.membershipType] : 'Sin plan'}
        </DetailItem>
        <DetailItem label="Vencimiento">
          {member.membershipEndsAt ? formatDate(member.membershipEndsAt) : 'Sin vencimiento'}
        </DetailItem>
        <DetailItem label="Días restantes">
          {member.membershipEndsAt
            ? describeDaysLeft(daysUntilInLima(member.membershipEndsAt))
            : 'No aplica'}
        </DetailItem>
        <DetailItem label="Saldo pendiente">
          <span className={hasDebt ? 'font-semibold text-status-problem' : undefined}>
            {formatCentsAsCurrency(member.outstandingBalance, 'PEN')}
          </span>
        </DetailItem>
        <DetailItem label="Renovación automática">
          {member.autoRenew ? 'Autorizada' : 'No autorizada'}
        </DetailItem>
      </DetailSection>

      {member.memberStatus === 'PENDING' ? (
        <p className="text-sm text-ink-muted">
          Esta solicitud espera una decisión.{' '}
          <Link className="font-medium text-action underline" to="/admin/solicitudes">
            Ir a solicitudes pendientes
          </Link>
        </p>
      ) : null}
    </div>
  );
}
