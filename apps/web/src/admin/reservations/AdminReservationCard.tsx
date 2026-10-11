// Tarjeta de una reserva en las vistas administrativas (US-034 criterio 13,
// US-036 criterio 12): instalación, fecha y hora de Lima, titular,
// participantes e invitados, estado y detalle expandible con participantes.

import { useId, useState, type ReactNode } from 'react';
import { Badge, Button, Card, Spinner } from '@activa-club/ui';
import type { AdminReservationListItem, ReservationParticipant } from '@activa-club/shared-types';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';
import {
  RESERVATION_STATUS_BADGE_VARIANT,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';
import { toAdminLoadError } from './admin-reservations-errors';
import { useAdminReservationDetailQuery } from './admin-reservations-query';
import { holderName, isOverduePending, participantsSummary } from './reservation-display';

interface AdminReservationCardProps {
  reservation: AdminReservationListItem;
  /** Nombre de la instalación; si el catálogo no lo tiene, se usa el tipo. */
  resourceName: string | null;
  now: Date;
  /** Botones de acción (aprobar/rechazar/cancelar) según la vista. */
  actions?: ReactNode;
}

export function AdminReservationCard({
  reservation,
  resourceName,
  now,
  actions,
}: AdminReservationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const title = resourceName ?? RESOURCE_TYPE_LABEL[reservation.resourceType];
  const overdue = isOverduePending(reservation, now);

  return (
    <Card compact className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">
            <span className="capitalize">{formatDateInLima(reservation.startsAt)}</span>,{' '}
            {formatTimeRangeInLima(reservation.startsAt, reservation.endsAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {overdue ? <Badge variant="danger">Vencida sin decisión</Badge> : null}
          <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[reservation.reservationStatus]}>
            {RESERVATION_STATUS_LABEL[reservation.reservationStatus]}
          </Badge>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="text-slate-500">Titular:</dt>
          <dd className="font-medium text-slate-900">{holderName(reservation)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Participantes:</dt>
          <dd className="text-slate-900">{participantsSummary(reservation)}</dd>
        </div>
      </dl>

      {overdue ? (
        <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          La fecha de esta solicitud ya pasó y no tuvo decisión. Ciérrala aprobándola o rechazándola
          con un motivo.
        </p>
      ) : null}

      {reservation.reservationStatus === 'REJECTED' && reservation.rejectionReason ? (
        <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          <span className="font-medium">Motivo del rechazo:</span> {reservation.rejectionReason}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle'}
        </Button>
        {actions ? <div className="flex flex-col gap-2 sm:flex-row">{actions}</div> : null}
      </div>

      {expanded ? (
        <div id={detailId}>
          <ReservationParticipantsPanel
            reservationId={reservation.reservationId}
            holderLabel={holderName(reservation)}
          />
        </div>
      ) : null}
    </Card>
  );
}

function participantLabel(
  participant: ReservationParticipant,
  holderLabel: string,
): { name: string; role: string } {
  switch (participant.participantType) {
    case 'HOLDER':
      return { name: holderLabel, role: 'Titular' };
    case 'MEMBER':
      // El contrato solo expone `memberId` (sin nombre): no se inventa uno.
      return { name: 'Socio del club', role: 'Socio' };
    case 'GUEST':
      return { name: participant.guestName ?? 'Invitado', role: 'Invitado externo' };
  }
}

function ReservationParticipantsPanel({
  reservationId,
  holderLabel,
}: {
  reservationId: string;
  holderLabel: string;
}) {
  const query = useAdminReservationDetailQuery(reservationId);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-4">
        <Spinner label="Cargando el detalle de la reserva…" />
      </div>
    );
  }

  if (query.isError) {
    const { message } = toAdminLoadError(query.error);
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg bg-danger-50 p-3 text-sm">
        <p className="text-danger-800">No pudimos cargar el detalle. {message}</p>
        <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const detail = query.data;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Participantes</h4>
        <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
          {detail.participants.map((participant) => {
            const { name, role } = participantLabel(participant, holderLabel);
            return (
              <li key={participant.participantId}>
                {name} <span className="text-slate-500">({role})</span>
              </li>
            );
          })}
        </ul>
      </div>
      {detail.cancelledAt ? (
        <p className="text-sm text-slate-700">
          <span className="font-medium">Cancelada el:</span>{' '}
          <span className="capitalize">{formatDateInLima(detail.cancelledAt)}</span>
        </p>
      ) : null}
    </div>
  );
}
