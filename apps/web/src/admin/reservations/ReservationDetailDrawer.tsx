// Panel de detalle de una reserva — US-077 (criterios 4 y 5).
//
// `GET /reservations/{id}`: instalación, fecha y franja en hora de Lima,
// estado, titular, participantes con su tipo, motivo de rechazo y momento de
// cancelación. El pie ofrece las acciones según el estado. El detalle del
// contrato no trae el nombre del titular: se toma de la lista ya cargada.

import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Drawer, ErrorState, Spinner } from '@activa-club/ui';
import type { ReservationDetail, ReservationParticipant } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';
import {
  RESERVATION_STATUS_BADGE_VARIANT,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';
import { toAdminLoadError } from './admin-reservations-errors';
import {
  ADMIN_RESERVATIONS_QUERY_KEY,
  useAdminReservationDetailQuery,
  useCachedHolder,
} from './admin-reservations-query';
import { formatRequestAge, holderName, isOverduePending } from './reservation-display';
import type { ReservationDecisionKind, ReservationDecisionTarget } from './useReservationDecisions';

interface ReservationDetailDrawerProps {
  /** `null` = cerrado. Viene de `?reserva=<id>`. */
  reservationId: string | null;
  now: Date;
  resourceNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onDecision: (kind: ReservationDecisionKind, reservation: ReservationDecisionTarget) => void;
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

export function ReservationDetailDrawer({
  reservationId,
  now,
  resourceNames,
  onClose,
  onDecision,
}: ReservationDetailDrawerProps) {
  const queryClient = useQueryClient();
  const query = useAdminReservationDetailQuery(reservationId);
  const cachedHolder = useCachedHolder(reservationId);
  const detail = query.data;
  const notFound = query.error instanceof ApiRequestError && query.error.code === 'NOT_FOUND';

  const title = detail
    ? (resourceNames.get(detail.resourceId) ?? RESOURCE_TYPE_LABEL[detail.resourceType])
    : 'Detalle de la reserva';

  return (
    <Drawer
      open={reservationId !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title={title}
      description={detail ? 'Detalle de la reserva' : undefined}
      footer={detail ? renderFooter(detail, cachedHolder, onDecision) : undefined}
    >
      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando el detalle de la reserva…" />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="No pudimos cargar el detalle"
          description={toAdminLoadError(query.error).message}
          action={
            notFound ? (
              <Button
                variant="secondary"
                onClick={() => {
                  // La reserva ya no existe: se refrescan las listas y se cierra.
                  void queryClient.invalidateQueries({ queryKey: ADMIN_RESERVATIONS_QUERY_KEY });
                  onClose();
                }}
              >
                Actualizar y cerrar
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            )
          }
        />
      ) : null}

      {detail ? (
        <DetailBody detail={detail} holder={cachedHolder} now={now} resourceNames={resourceNames} />
      ) : null}
    </Drawer>
  );
}

function renderFooter(
  detail: ReservationDetail,
  holder: ReservationDecisionTarget['holder'],
  onDecision: ReservationDetailDrawerProps['onDecision'],
) {
  const target: ReservationDecisionTarget = { ...detail, holder };
  switch (detail.reservationStatus) {
    case 'PENDING_APPROVAL':
      return (
        <>
          <Button variant="secondary" onClick={() => onDecision('cancel', target)}>
            Cancelar reserva
          </Button>
          <Button variant="danger" onClick={() => onDecision('reject', target)}>
            Rechazar
          </Button>
          <Button variant="positive" onClick={() => onDecision('approve', target)}>
            Aprobar
          </Button>
        </>
      );
    case 'CONFIRMED':
    case 'APPROVED':
      return (
        <Button variant="danger" onClick={() => onDecision('cancel', target)}>
          Cancelar reserva
        </Button>
      );
    default:
      return undefined;
  }
}

function DetailBody({
  detail,
  holder,
  now,
  resourceNames,
}: {
  detail: ReservationDetail;
  holder: ReservationDecisionTarget['holder'];
  now: Date;
  resourceNames: ReadonlyMap<string, string>;
}) {
  const holderLabel = holderName({ holder });
  const overdue = isOverduePending(detail, now);
  const resourceLabel =
    resourceNames.get(detail.resourceId) ?? RESOURCE_TYPE_LABEL[detail.resourceType];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[detail.reservationStatus]}>
          {RESERVATION_STATUS_LABEL[detail.reservationStatus]}
        </Badge>
        {overdue ? <Badge variant="danger">Vencida sin decisión</Badge> : null}
      </div>

      {overdue ? (
        <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          La fecha de esta solicitud ya pasó y no tuvo decisión. Ciérrala aprobándola o rechazándola
          con un motivo.
        </p>
      ) : null}

      {detail.reservationStatus === 'REJECTED' && detail.rejectionReason ? (
        <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          <span className="font-medium">Motivo del rechazo:</span> {detail.rejectionReason}
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-3 text-sm">
        <div>
          <dt className="text-ink-muted">Instalación</dt>
          <dd className="font-medium text-ink">{resourceLabel}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Fecha y hora</dt>
          <dd className="font-medium text-ink">
            <span className="capitalize">{formatDateInLima(detail.startsAt)}</span>,{' '}
            {formatTimeRangeInLima(detail.startsAt, detail.endsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Titular</dt>
          <dd className="font-medium text-ink">{holderLabel}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Solicitada</dt>
          <dd className="text-ink">{formatRequestAge(detail.createdAt, now)}</dd>
        </div>
        {detail.cancelledAt ? (
          <div>
            <dt className="text-ink-muted">Cancelada el</dt>
            <dd className="text-ink">
              <span className="capitalize">{formatDateInLima(detail.cancelledAt)}</span>
            </dd>
          </div>
        ) : null}
      </dl>

      <div>
        <h3 className="type-card-title text-ink">Participantes</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink">
          {detail.participants.map((participant) => {
            const { name, role } = participantLabel(participant, holderLabel);
            return (
              <li key={participant.participantId}>
                {name} <span className="text-ink-muted">({role})</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
