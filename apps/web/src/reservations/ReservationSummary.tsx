// Resumen y confirmación de la reserva (US-032, criterios 6, 7 y 11) y
// resultado devuelto por el servidor.

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, Textarea, buttonVariants } from '@activa-club/ui';
import type {
  AvailabilitySlot,
  CreateReservationResponse,
  Resource,
} from '@activa-club/shared-types';
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

/** Día de un instante UTC en hora del club (una franja nocturna cae en el
 * día siguiente en UTC, pero no en `America/Lima`). */
function formatInstantDayInLima(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'America/Lima' }).format(
    new Date(iso),
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
  isSubmitting: boolean;
  onConfirm: () => void;
}

export function ReservationSummary({
  resource,
  date,
  slot,
  participants,
  notes,
  onNotesChange,
  isSubmitting,
  onConfirm,
}: ReservationSummaryProps) {
  const total = participants.length + 1;
  const guests = participants.filter((participant) => participant.type === 'GUEST').length;
  const overCapacity = total > resource.capacity;

  return (
    <Card>
      <CardHeader title="Resumen de tu reserva" />

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Instalación</dt>
          <dd className="font-medium text-slate-900">
            {resource.name} ({RESOURCE_TYPE_LABEL[resource.type]})
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Día y horario</dt>
          <dd className="font-medium text-slate-900">
            {formatReservationDay(date)}, {formatTimeRangeInLima(slot.startsAt, slot.endsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Personas</dt>
          <dd className="font-medium text-slate-900">
            {total} de {resource.capacity} (tú
            {participants.length > 0
              ? `, ${participants.map((participant) => participantFullName(participant)).join(', ')}`
              : ''}
            )
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Invitados externos</dt>
          <dd className="font-medium text-slate-900">{guests}</dd>
        </div>
      </dl>

      {resource.requiresApproval ? (
        <p
          role="note"
          className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900"
        >
          Esta instalación requiere aprobación del administrador. Al confirmar, enviarás una
          solicitud que quedará pendiente de revisión: la reserva no es inmediata.
        </p>
      ) : null}

      <div className="mt-4">
        <Textarea
          label="Notas (opcional)"
          rows={2}
          maxLength={NOTES_MAX_LENGTH}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          helpText={`Hasta ${NOTES_MAX_LENGTH} caracteres, por ejemplo el motivo del evento.`}
        />
      </div>

      {overCapacity ? (
        <p role="alert" className="mt-4 text-sm text-danger-700">
          Superaste el aforo de esta instalación ({resource.capacity} personas). Quita participantes
          para poder confirmar.
        </p>
      ) : null}

      <div className="mt-4">
        <Button
          type="button"
          variant="positive"
          fullWidth
          isLoading={isSubmitting}
          disabled={isSubmitting || overCapacity}
          onClick={onConfirm}
        >
          {isSubmitting
            ? 'Enviando…'
            : resource.requiresApproval
              ? 'Enviar solicitud de reserva'
              : 'Confirmar reserva'}
        </Button>
      </div>
    </Card>
  );
}

interface ReservationErrorAlertProps {
  feedback: ReservationErrorFeedback;
}

export function ReservationErrorAlert({ feedback }: ReservationErrorAlertProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800"
    >
      <p className="font-semibold">{feedback.title}</p>
      <p>{feedback.message}</p>
      {feedback.showPaymentLink ? (
        <Link
          to="/socio/membresia/pagar"
          className={buttonVariants({ variant: 'primary', className: 'self-start' })}
        >
          Ir a pagar mi membresía
        </Link>
      ) : null}
    </div>
  );
}

interface ReservationResultProps {
  resource: Resource;
  response: CreateReservationResponse;
  onNewReservation: () => void;
}

export function ReservationResult({
  resource,
  response,
  onNewReservation,
}: ReservationResultProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isPending = response.reservationStatus === 'PENDING_APPROVAL';

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Card>
      <div role="status" className="flex flex-col gap-3">
        <Badge variant={isPending ? 'warning' : 'positive'}>
          {isPending ? 'Pendiente de aprobación' : 'Reserva confirmada'}
        </Badge>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-slate-900 focus:outline-none"
        >
          {isPending ? 'Solicitud enviada a revisión' : 'Tu reserva está confirmada'}
        </h2>
        <p className="text-sm text-slate-700">
          {isPending
            ? `Enviamos tu solicitud para ${resource.name}. El administrador la revisará y te avisaremos cuando sea aprobada o rechazada. Hasta entonces la reserva no está confirmada.`
            : `Reservaste ${resource.name} para ${formatInstantDayInLima(
                response.startsAt,
              )}. Ya está confirmada.`}
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Horario</dt>
            <dd className="font-medium text-slate-900">
              {formatTimeRangeInLima(response.startsAt, response.endsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Personas</dt>
            <dd className="font-medium text-slate-900">
              {response.participantCount}
              {response.guestCount > 0 ? ` (${response.guestCount} invitados externos)` : ''}
            </dd>
          </div>
        </dl>
        <Button type="button" variant="secondary" onClick={onNewReservation}>
          Hacer otra reserva
        </Button>
      </div>
    </Card>
  );
}
