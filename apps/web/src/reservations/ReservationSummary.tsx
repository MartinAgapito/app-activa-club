// Resumen de la reserva (US-032, criterios 6 y 7; paso 4 del asistente de
// US-072) y aviso de error del servidor. El botón de confirmar vive en el pie
// de la ventana del asistente, no aquí.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Textarea, buttonVariants } from '@activa-club/ui';
import type { AvailabilitySlot, Resource } from '@activa-club/shared-types';
import { formatTimeRangeInLima } from '../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../lib/format/resource';
import { participantFullName, type DraftParticipant } from './participants';
import type { ReservationErrorFeedback } from './reservation-errors';

/** `YYYY-MM-DD` -> "miércoles, 12 de agosto de 2026" (el día ya viene en
 * hora del club; se formatea en UTC para no desplazarlo). */
function formatReservationDay(date: string): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

const NOTES_MAX_LENGTH = 280;

interface ReservationSummaryProps {
  resource: Resource;
  date: string;
  slot: AvailabilitySlot;
  participants: DraftParticipant[];
  notes: string;
  onNotesChange: (notes: string) => void;
}

export function ReservationSummary({
  resource,
  date,
  slot,
  participants,
  notes,
  onNotesChange,
}: ReservationSummaryProps) {
  const total = participants.length + 1;
  const guests = participants.filter((participant) => participant.type === 'GUEST').length;
  const overCapacity = total > resource.capacity;

  return (
    <div className="flex flex-col gap-4">
      <h4 className="type-card-title text-ink">Resumen de tu reserva</h4>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Instalación</dt>
          <dd className="font-medium text-ink">
            {resource.name} ({RESOURCE_TYPE_LABEL[resource.type]})
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Día y horario</dt>
          <dd className="font-medium text-ink">
            {formatReservationDay(date)},{' '}
            <span className="font-display tabular-nums">
              {formatTimeRangeInLima(slot.startsAt, slot.endsAt)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Personas</dt>
          <dd className="font-medium text-ink">
            {total} de {resource.capacity} (tú
            {participants.length > 0
              ? `, ${participants.map((participant) => participantFullName(participant)).join(', ')}`
              : ''}
            )
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Invitados externos</dt>
          <dd className="font-medium text-ink">{guests}</dd>
        </div>
      </dl>

      {resource.requiresApproval ? (
        <p
          role="note"
          className="rounded-control border border-status-pending bg-status-pending-soft px-3 py-2 text-sm text-ink"
        >
          <Badge variant="warning">Requiere aprobación</Badge>{' '}
          <span className="mt-1 block">
            Esta instalación requiere aprobación del administrador. Al confirmar, enviarás una
            solicitud que quedará pendiente de revisión: la reserva no es inmediata.
          </span>
        </p>
      ) : (
        <p
          role="note"
          className="rounded-control border border-status-confirmed bg-status-confirmed-soft px-3 py-2 text-sm text-ink"
        >
          <Badge variant="positive">Confirmación inmediata</Badge>{' '}
          <span className="mt-1 block">
            Esta instalación no requiere aprobación: tu reserva quedará confirmada al instante.
          </span>
        </p>
      )}

      <Textarea
        label="Notas (opcional)"
        rows={2}
        maxLength={NOTES_MAX_LENGTH}
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        helpText={`Hasta ${NOTES_MAX_LENGTH} caracteres, por ejemplo el motivo del evento.`}
      />

      {overCapacity ? (
        <p role="alert" className="text-sm text-status-problem">
          Superaste el aforo de esta instalación ({resource.capacity} personas). Quita participantes
          para poder confirmar.
        </p>
      ) : null}
    </div>
  );
}

interface ReservationErrorAlertProps {
  feedback: ReservationErrorFeedback;
  /** Acciones de corrección (p. ej. "Elegir otra franja"). */
  actions?: ReactNode;
}

export function ReservationErrorAlert({ feedback, actions }: ReservationErrorAlertProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-card border border-status-problem bg-status-problem-soft p-4 text-sm text-ink"
    >
      <p className="font-semibold text-status-problem">{feedback.title}</p>
      <p>{feedback.message}</p>
      {feedback.showPaymentLink ? (
        <Link
          to="/socio/membresia/pagar"
          className={buttonVariants({ variant: 'primary', className: 'self-start' })}
        >
          Ir a pagar mi membresía
        </Link>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
