// Tarjeta de una reserva propia con detalle expandible y acción de cancelar
// (US-033, criterios 3, 13 y 14).

import { useId, useState } from 'react';
import { Badge, Button, Card, Spinner } from '@activa-club/ui';
import type { Reservation, ReservationParticipant } from '@activa-club/shared-types';
import { formatDateInLima, formatTimeRangeInLima } from '../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../lib/format/resource';
import { CANCEL_BLOCK_COPY, getCancelBlock } from './cancellation';
import { toLoadErrorMessage } from './my-reservations-errors';
import { useReservationDetailQuery } from './my-reservations-query';
import { RESERVATION_STATUS_BADGE_VARIANT, RESERVATION_STATUS_LABEL } from './reservation-status';

interface MyReservationCardProps {
  reservation: Reservation;
  /** Nombre de la instalación; si el catálogo no lo tiene, se usa el tipo. */
  resourceName: string | null;
  now: Date;
  isCancelling: boolean;
  onCancel: (reservation: Reservation) => void;
}

export function MyReservationCard({
  reservation,
  resourceName,
  now,
  isCancelling,
  onCancel,
}: MyReservationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const reasonId = useId();
  const block = getCancelBlock(reservation, now);
  const title = resourceName ?? RESOURCE_TYPE_LABEL[reservation.resourceType];
  const externalGuests = reservation.guestCount;

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
        <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[reservation.reservationStatus]}>
          {RESERVATION_STATUS_LABEL[reservation.reservationStatus]}
        </Badge>
      </div>

      <p className="text-sm text-slate-600">
        {reservation.participantCount} {reservation.participantCount === 1 ? 'persona' : 'personas'}
        {externalGuests > 0
          ? `, ${externalGuests} ${externalGuests === 1 ? 'invitado externo' : 'invitados externos'}`
          : ''}
      </p>

      {reservation.reservationStatus === 'REJECTED' && reservation.rejectionReason ? (
        <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          <span className="font-medium">Motivo del rechazo:</span> {reservation.rejectionReason}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle'}
        </Button>

        <div className="flex flex-col gap-1 sm:items-end">
          <Button
            type="button"
            variant="danger"
            disabled={block !== null || isCancelling}
            isLoading={isCancelling}
            aria-describedby={block ? reasonId : undefined}
            onClick={() => onCancel(reservation)}
          >
            Cancelar reserva
          </Button>
          {block ? (
            <p id={reasonId} className="text-xs text-slate-600 sm:text-right">
              {CANCEL_BLOCK_COPY[block]}
            </p>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div id={detailId}>
          <ReservationDetailPanel reservationId={reservation.reservationId} />
        </div>
      ) : null}
    </Card>
  );
}

function participantLabel(participant: ReservationParticipant): {
  name: string;
  role: string;
} {
  switch (participant.participantType) {
    case 'HOLDER':
      return { name: 'Tú', role: 'Titular' };
    case 'MEMBER':
      // El contrato solo expone `memberId` (sin nombre): no se inventa uno.
      return { name: 'Socio del club', role: 'Socio' };
    case 'GUEST':
      return { name: participant.guestName ?? 'Invitado', role: 'Invitado externo' };
  }
}

function ReservationDetailPanel({ reservationId }: { reservationId: string }) {
  const query = useReservationDetailQuery(reservationId);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-4">
        <Spinner label="Cargando el detalle de la reserva…" />
      </div>
    );
  }

  if (query.isError) {
    const { message } = toLoadErrorMessage(query.error);
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
            const { name, role } = participantLabel(participant);
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
      {detail.rejectionReason ? (
        <p className="text-sm text-slate-700">
          <span className="font-medium">Motivo del rechazo:</span> {detail.rejectionReason}
        </p>
      ) : null}
    </div>
  );
}
