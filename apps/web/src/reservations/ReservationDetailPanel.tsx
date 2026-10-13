// Panel lateral de detalle de una reserva propia, con la cancelación en
// ventana (US-074; criterios de US-033: 5, 6, 13 y 14).
//
// Consume `GET /reservations/{id}` y `POST /reservations/{id}/cancel`
// (docs/api/contratos-api.md §7). La interfaz anticipa la regla de 24 horas
// (RN-RES-10) pero gana el servidor: sus errores se muestran traducidos
// dentro de la ventana de confirmación, sin cerrarla.

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ConfirmDialog, Drawer, Spinner, useToast } from '@activa-club/ui';
import type { ReservationDetail, ReservationParticipant } from '@activa-club/shared-types';
import { ApiRequestError } from '../lib/api/http-client';
import { formatDateInLima, formatTimeRangeInLima } from '../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../lib/format/resource';
import { MEMBER_DASHBOARD_QUERY_KEY } from '../dashboard/member-dashboard-query';
import { CANCEL_BLOCK_COPY, getCancelBlock } from './cancellation';
import {
  toCancelErrorFeedback,
  toLoadErrorMessage,
  type CancelErrorFeedback,
} from './my-reservations-errors';
import {
  MY_RESERVATIONS_QUERY_KEY,
  useCancelReservationMutation,
  useReservationDetailQuery,
} from './my-reservations-query';
import { RESERVATION_STATUS_BADGE_VARIANT, RESERVATION_STATUS_LABEL } from './reservation-status';

export interface ReservationDetailPanelProps {
  /** Reserva abierta (`?reserva=`); `null` con el panel cerrado. */
  reservationId: string | null;
  now: Date;
  /** Nombre de la instalación según el catálogo; `null` si no se conoce. */
  resourceNameOf: (resourceId: string) => string | null;
  onClose: () => void;
  /** La sesión expiró: el guard de rutas lleva a /login y devuelve aquí. */
  onSessionExpired: () => void;
}

function participantLabel(participant: ReservationParticipant): { name: string; role: string } {
  switch (participant.participantType) {
    case 'HOLDER':
      return { name: 'Tú', role: 'Titular' };
    case 'MEMBER':
      // El contrato solo expone `memberId` (sin nombre): no se inventa uno.
      return { name: 'Socio del club', role: 'Socio' };
    case 'GUEST':
      // Nunca se muestra el DNI del invitado.
      return { name: participant.guestName ?? 'Invitado', role: 'Invitado externo' };
  }
}

export function ReservationDetailPanel({
  reservationId,
  now,
  resourceNameOf,
  onClose,
  onSessionExpired,
}: ReservationDetailPanelProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cancelMutation = useCancelReservationMutation();

  // Se conserva la última reserva mostrada para que la animación de salida
  // no deje el panel vacío; al abrir otra se reinicia el estado de cancelación.
  const [shownId, setShownId] = useState<string | null>(reservationId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<CancelErrorFeedback | null>(null);
  if (reservationId !== null && reservationId !== shownId) {
    setShownId(reservationId);
    setConfirmOpen(false);
    setCancelError(null);
  }
  // Guarda síncrona contra doble clic en "Sí, cancelar reserva".
  const inFlightRef = useRef(false);

  const query = useReservationDetailQuery(shownId ?? '', shownId !== null);
  const detail = query.data;
  const block = detail ? getCancelBlock(detail, now) : null;

  function refreshAfterChange(resourceId: string) {
    void queryClient.invalidateQueries({ queryKey: MY_RESERVATIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: MEMBER_DASHBOARD_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['resources', resourceId, 'availability'] });
  }

  async function confirmCancel() {
    if (inFlightRef.current || !detail) {
      return;
    }
    inFlightRef.current = true;
    try {
      await cancelMutation.mutateAsync(detail.reservationId);
      setConfirmOpen(false);
      toast.success('Reserva cancelada');
      refreshAfterChange(detail.resourceId);
      onClose();
    } catch (error) {
      const feedback = toCancelErrorFeedback(error);
      setCancelError(feedback);
      if (feedback.refresh) {
        refreshAfterChange(detail.resourceId);
      }
      if (feedback.sessionExpired) {
        onSessionExpired();
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  const name = detail
    ? (resourceNameOf(detail.resourceId) ?? RESOURCE_TYPE_LABEL[detail.resourceType])
    : '';

  let body;
  if (shownId === null || query.isPending) {
    body = (
      <div className="flex justify-center py-10">
        <Spinner label="Cargando el detalle de la reserva…" />
      </div>
    );
  } else if (query.isError) {
    const isNotFound = query.error instanceof ApiRequestError && query.error.code === 'NOT_FOUND';
    const { message, sessionExpired } = toLoadErrorMessage(query.error);
    body = (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-card border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800"
      >
        <p className="font-semibold">
          {isNotFound ? 'No encontramos esta reserva' : 'No pudimos cargar el detalle'}
        </p>
        <p>{isNotFound ? 'No existe o no pertenece a tu cuenta.' : message}</p>
        {isNotFound ? null : sessionExpired ? (
          <Button type="button" variant="secondary" onClick={onSessionExpired}>
            Iniciar sesión
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        )}
      </div>
    );
  } else {
    body = <DetailBody detail={query.data} name={name} />;
  }

  return (
    <>
      <Drawer
        open={reservationId !== null}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        title="Detalle de la reserva"
        footer={
          detail ? (
            <div className="flex w-full flex-col gap-2 sm:items-end">
              <Button
                type="button"
                variant="danger"
                disabled={block !== null}
                aria-describedby={block ? 'cancel-block-reason' : undefined}
                onClick={() => {
                  setCancelError(null);
                  setConfirmOpen(true);
                }}
              >
                Cancelar reserva
              </Button>
              {block ? (
                <p id="cancel-block-reason" className="type-aux text-ink-muted sm:text-right">
                  {CANCEL_BLOCK_COPY[block]}
                </p>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {body}
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Cancelar esta reserva?"
        description={
          detail
            ? `${name}, ${formatDateInLima(detail.startsAt)}, ${formatTimeRangeInLima(
                detail.startsAt,
                detail.endsAt,
              )}. La franja quedará libre para otros socios y el cupo mensual de tus invitados se devolverá. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Sí, cancelar reserva"
        cancelLabel="Mantener reserva"
        confirmVariant="danger"
        confirmDisabled={cancelError?.refresh === true || cancelError?.sessionExpired === true}
        isLoading={cancelMutation.isPending}
        onConfirm={() => void confirmCancel()}
        onCancel={() => {
          if (!cancelMutation.isPending) {
            setConfirmOpen(false);
          }
        }}
      >
        {cancelError ? (
          <div
            role="alert"
            className="mt-3 flex flex-col gap-1 rounded-card border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800"
          >
            <p className="font-semibold">{cancelError.title}</p>
            <p>{cancelError.message}</p>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function DetailBody({ detail, name }: { detail: ReservationDetail; name: string }) {
  const guests = detail.guestCount;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-ink-muted">Instalación</dt>
        <dd className="font-semibold text-ink">{name}</dd>
        <dt className="text-ink-muted">Fecha</dt>
        <dd className="capitalize text-ink">{formatDateInLima(detail.startsAt)}</dd>
        <dt className="text-ink-muted">Horario</dt>
        <dd className="font-display font-semibold tabular-nums text-ink">
          {formatTimeRangeInLima(detail.startsAt, detail.endsAt)}
        </dd>
        <dt className="text-ink-muted">Estado</dt>
        <dd>
          <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[detail.reservationStatus]}>
            {RESERVATION_STATUS_LABEL[detail.reservationStatus]}
          </Badge>
        </dd>
        <dt className="text-ink-muted">Personas</dt>
        <dd className="text-ink">
          {detail.participantCount} {detail.participantCount === 1 ? 'persona' : 'personas'}
          {guests > 0
            ? `, ${guests} ${guests === 1 ? 'invitado externo' : 'invitados externos'}`
            : ''}
        </dd>
        {detail.cancelledAt ? (
          <>
            <dt className="text-ink-muted">Cancelada el</dt>
            <dd className="capitalize text-ink">{formatDateInLima(detail.cancelledAt)}</dd>
          </>
        ) : null}
      </dl>

      {detail.reservationStatus === 'REJECTED' && detail.rejectionReason ? (
        <p className="rounded-card border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          <span className="font-medium">Motivo del rechazo:</span> {detail.rejectionReason}
        </p>
      ) : null}

      <section aria-labelledby="reservation-participants-heading">
        <h3 id="reservation-participants-heading" className="type-card-title text-ink">
          Participantes
        </h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink">
          {detail.participants.map((participant) => {
            const { name: participantName, role } = participantLabel(participant);
            return (
              <li key={participant.participantId}>
                {participantName} <span className="text-ink-muted">({role})</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
