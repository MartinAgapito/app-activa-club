// Reservas — flujo completo de reserva de una instalación (US-028, US-029,
// US-032).
//
// Elegir instalación + día + franja (disponibilidad real, docs/api/
// contratos-api.md §6) -> agregar participantes por DNI -> resumen ->
// confirmar con `POST /reservations` (§7). Todas las reglas críticas las
// valida el servidor (US-030 y US-031): la interfaz las anticipa (aforo,
// deuda, duplicados) pero si el servidor rechaza algo, gana el servidor
// (criterio 14). El estado del flujo vive aquí para que instalación,
// participantes y notas sobrevivan a un refresco de disponibilidad
// (criterio 9). "Mis reservas" y la bandeja admin son US-033/US-034.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Spinner,
  buttonVariants,
} from '@activa-club/ui';
import type {
  AvailabilityResponse,
  AvailabilitySlot,
  CreateReservationResponse,
  Resource,
} from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { ApiRequestError } from '../../lib/api/http-client';
import { getTodayInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import {
  AVAILABILITY_SLOT_STATUS_BADGE_VARIANT,
  AVAILABILITY_SLOT_STATUS_LABEL,
  RESOURCE_STATUS_BADGE_VARIANT,
  RESOURCE_STATUS_LABEL,
  RESOURCE_TYPE_LABEL,
  formatBlockDuration,
} from '../../lib/format/resource';
import { useMemberProfileQuery } from '../../members/profile-query';
import { useResourceAvailabilityQuery, useResourcesQuery } from '../../resources/resources-query';
import { RESERVATION_BLOCK_COPY, getReservationBlock } from '../../reservations/eligibility';
import {
  participantKey,
  toParticipantInput,
  type DraftParticipant,
} from '../../reservations/participants';
import { ParticipantsSection } from '../../reservations/ParticipantsSection';
import {
  toReservationErrorFeedback,
  type ReservationErrorFeedback,
} from '../../reservations/reservation-errors';
import { useCreateReservationMutation } from '../../reservations/reservations-query';
import {
  ReservationErrorAlert,
  ReservationResult,
  ReservationSummary,
} from '../../reservations/ReservationSummary';

interface CompletedReservation {
  resource: Resource;
  response: CreateReservationResponse;
}

export function ReservationsPage() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const resourcesQuery = useResourcesQuery();
  const profileQuery = useMemberProfileQuery();
  const createMutation = useCreateReservationMutation();

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayInLima());
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [participants, setParticipants] = useState<DraftParticipant[]>([]);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<ReservationErrorFeedback | null>(null);
  const [completed, setCompleted] = useState<CompletedReservation | null>(null);
  // Guarda síncrona contra doble clic: `isPending` solo se refleja tras el
  // siguiente render (criterio 11).
  const inFlightRef = useRef(false);

  const selectedResource =
    resourcesQuery.data?.find((resource) => resource.resourceId === selectedResourceId) ?? null;

  const availabilityQuery = useResourceAvailabilityQuery(
    selectedResource ? selectedResource.resourceId : null,
    selectedResource ? selectedDate : null,
  );

  // Solo cuenta si la franja sigue libre en la última disponibilidad: tras un
  // refresco por `RESERVATION_OVERLAP` deja de estar seleccionada.
  const selectedSlot: AvailabilitySlot | null =
    availabilityQuery.data?.slots.find(
      (slot) => slot.startsAt === selectedSlotStart && slot.available,
    ) ?? null;

  const profile = profileQuery.data;
  const block = profile ? getReservationBlock(profile) : null;

  function selectResource(resourceId: string) {
    setSelectedResourceId(resourceId);
    setSelectedSlotStart(null);
    setSubmitError(null);
    setCompleted(null);
  }

  function changeDate(nextDate: string) {
    setSelectedDate(nextDate);
    setSelectedSlotStart(null);
    setSubmitError(null);
  }

  function selectSlot(startsAt: string) {
    setSelectedSlotStart(startsAt);
    setSubmitError(null);
  }

  function refreshAvailability(resourceId: string) {
    void queryClient.invalidateQueries({ queryKey: ['resources', resourceId, 'availability'] });
  }

  async function confirm() {
    if (inFlightRef.current || !selectedResource || !selectedSlot) {
      return;
    }
    inFlightRef.current = true;
    setSubmitError(null);

    try {
      const trimmedNotes = notes.trim();
      // Sin `endsAt` ni `holderMemberId`: no existen en el contrato de
      // entrada (el servidor calcula el fin y el titular es el autenticado).
      const response = await createMutation.mutateAsync({
        resourceId: selectedResource.resourceId,
        startsAt: selectedSlot.startsAt,
        participants: participants.map(toParticipantInput),
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      setCompleted({ resource: selectedResource, response });
      setParticipants([]);
      setNotes('');
      setSelectedSlotStart(null);
      refreshAvailability(selectedResource.resourceId);
    } catch (error) {
      const feedback = toReservationErrorFeedback(error);
      setSubmitError(feedback);
      if (feedback.refreshAvailability) {
        refreshAvailability(selectedResource.resourceId);
      }
      if (feedback.sessionExpired) {
        // El guard de rutas redirige a /login y, tras autenticarse, devuelve
        // al socio a esta pantalla (mismo criterio que el checkout).
        signOut();
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  const hasAvailableSlot = availabilityQuery.data?.slots.some((slot) => slot.available) ?? false;
  const showDraft = Boolean(selectedResource && selectedSlot && !block && !completed);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas"
        description="Elige una instalación, un día y un horario, agrega a tus acompañantes y confirma tu reserva."
        actions={
          <Link to="/socio/reservas/mias" className={buttonVariants({ variant: 'secondary' })}>
            Mis reservas
          </Link>
        }
      />

      {block ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-danger-200 bg-danger-50 p-4"
        >
          <p className="text-base font-semibold text-danger-800">
            {RESERVATION_BLOCK_COPY[block].title}
          </p>
          <p className="text-sm text-danger-800">{RESERVATION_BLOCK_COPY[block].message}</p>
          <Link
            to="/socio/membresia/pagar"
            className={buttonVariants({ variant: 'primary', className: 'self-start' })}
          >
            Ir a pagar mi membresía
          </Link>
        </div>
      ) : null}

      <ResourceCatalogSection
        query={resourcesQuery}
        selectedResourceId={selectedResourceId}
        onSelect={selectResource}
      />

      {selectedResource ? (
        <AvailabilitySection
          resource={selectedResource}
          date={selectedDate}
          onDateChange={changeDate}
          query={availabilityQuery}
          selectedSlotStart={selectedSlot ? selectedSlotStart : null}
          onSelectSlot={selectSlot}
        />
      ) : null}

      {submitError ? <ReservationErrorAlert feedback={submitError} /> : null}

      {completed ? (
        <ReservationResult
          resource={completed.resource}
          response={completed.response}
          onNewReservation={() => setCompleted(null)}
        />
      ) : null}

      {selectedResource && !selectedSlot && !block && !completed && hasAvailableSlot ? (
        <p className="text-sm text-slate-600">
          Elige una franja libre para agregar participantes y confirmar tu reserva.
        </p>
      ) : null}

      {showDraft && selectedResource && selectedSlot ? (
        <>
          <ParticipantsSection
            resourceName={selectedResource.name}
            capacity={selectedResource.capacity}
            participants={participants}
            holderMemberId={profile?.memberId ?? null}
            holderDni={profile?.dni ?? null}
            onAdd={(participant) => {
              setSubmitError(null);
              setParticipants((current) => [...current, participant]);
            }}
            onRemove={(key) => {
              setSubmitError(null);
              setParticipants((current) => current.filter((item) => participantKey(item) !== key));
            }}
          />
          <ReservationSummary
            resource={selectedResource}
            date={selectedDate}
            slot={selectedSlot}
            participants={participants}
            notes={notes}
            onNotesChange={setNotes}
            isSubmitting={createMutation.isPending}
            onConfirm={() => void confirm()}
          />
        </>
      ) : null}
    </div>
  );
}

// --- Catálogo (US-028) ---

interface ResourceCatalogSectionProps {
  query: UseQueryResult<Resource[]>;
  selectedResourceId: string | null;
  onSelect: (resourceId: string) => void;
}

function ResourceCatalogSection({
  query,
  selectedResourceId,
  onSelect,
}: ResourceCatalogSectionProps) {
  return (
    <section aria-labelledby="catalogo-instalaciones-heading" className="flex flex-col gap-4">
      <h2 id="catalogo-instalaciones-heading" className="text-lg font-semibold text-slate-900">
        Instalaciones del club
      </h2>

      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando el catálogo de instalaciones…" />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="No pudimos cargar el catálogo de instalaciones"
          description={
            query.error instanceof ApiRequestError
              ? query.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
        />
      ) : null}

      {query.data && query.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay instalaciones cargadas"
          description="El catálogo del club se está configurando. Vuelve a intentarlo más tarde."
        />
      ) : null}

      {query.data && query.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((resource) => (
            <ResourceCard
              key={resource.resourceId}
              resource={resource}
              selected={resource.resourceId === selectedResourceId}
              onSelect={() => onSelect(resource.resourceId)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface ResourceCardProps {
  resource: Resource;
  selected: boolean;
  onSelect: () => void;
}

function ResourceCard({ resource, selected, onSelect }: ResourceCardProps) {
  return (
    <Card compact className="flex flex-col gap-3">
      <CardHeader
        title={resource.name}
        description={RESOURCE_TYPE_LABEL[resource.type]}
        action={
          <Badge variant={RESOURCE_STATUS_BADGE_VARIANT[resource.resourceStatus]}>
            {RESOURCE_STATUS_LABEL[resource.resourceStatus]}
          </Badge>
        }
      />

      <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600">
        <div>
          <dt className="text-slate-400">Aforo</dt>
          <dd className="font-medium text-slate-900">{resource.capacity} personas</dd>
        </div>
        <div>
          <dt className="text-slate-400">Duración</dt>
          <dd className="font-medium text-slate-900">
            {formatBlockDuration(resource.blockMinutes)}
          </dd>
        </div>
      </dl>

      {resource.requiresApproval ? (
        <Badge variant="info">Requiere aprobación del administrador</Badge>
      ) : null}

      <Button
        type="button"
        fullWidth
        variant={selected ? 'positive' : 'secondary'}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {selected ? 'Instalación seleccionada' : 'Ver disponibilidad'}
      </Button>
    </Card>
  );
}

// --- Disponibilidad por día (US-029) ---

interface AvailabilitySectionProps {
  resource: Resource;
  date: string;
  onDateChange: (date: string) => void;
  query: UseQueryResult<AvailabilityResponse>;
  selectedSlotStart: string | null;
  onSelectSlot: (startsAt: string) => void;
}

function AvailabilitySection({
  resource,
  date,
  onDateChange,
  query,
  selectedSlotStart,
  onSelectSlot,
}: AvailabilitySectionProps) {
  const hasAvailableSlot = query.data?.slots.some((slot) => slot.available) ?? false;

  return (
    <section aria-labelledby="disponibilidad-heading" className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title={`Disponibilidad — ${resource.name}`}
          description="Las franjas se muestran en hora del club (America/Lima)."
        />

        <div className="max-w-xs">
          <Input
            type="date"
            label="Día"
            id="reservations-date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>

        <div className="mt-4">
          <h3 id="disponibilidad-heading" className="sr-only">
            Franjas horarias del día seleccionado
          </h3>

          {query.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" label="Cargando la disponibilidad del día…" />
            </div>
          ) : null}

          {query.isError ? (
            <ErrorState
              title="No pudimos cargar la disponibilidad"
              description={
                query.error instanceof ApiRequestError
                  ? query.error.message
                  : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
              }
              action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
            />
          ) : null}

          {query.data ? (
            <AvailabilityResult
              response={query.data}
              selectedSlotStart={selectedSlotStart}
              onSelectSlot={onSelectSlot}
            />
          ) : null}

          {query.data && !hasAvailableSlot && query.data.resourceStatus === 'AVAILABLE' ? (
            <p className="mt-4 text-sm text-slate-600">
              No hay franjas libres para este día. Prueba con otra fecha.
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

interface AvailabilityResultProps {
  response: AvailabilityResponse;
  selectedSlotStart: string | null;
  onSelectSlot: (startsAt: string) => void;
}

function AvailabilityResult({
  response,
  selectedSlotStart,
  onSelectSlot,
}: AvailabilityResultProps) {
  if (response.slots.length === 0) {
    return (
      <EmptyState
        title="Sin franjas disponibles"
        description="Esta instalación no tiene franjas configuradas para este horario."
      />
    );
  }

  // Criterio 11 de US-029: cuando el recurso está en mantenimiento indefinido
  // se avisa una sola vez a nivel de recurso, en vez de repetir el mismo
  // mensaje franja por franja.
  const isWholeResourceInMaintenance = response.resourceStatus === 'MAINTENANCE';

  return (
    <div className="flex flex-col gap-3">
      {isWholeResourceInMaintenance ? (
        <p
          role="status"
          className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          Esta instalación está en mantenimiento y no admite reservas por el momento.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {response.slots.map((slot) => (
          <li key={slot.startsAt}>
            <SlotButton
              slot={slot}
              selected={slot.startsAt === selectedSlotStart}
              hideStatusLabel={isWholeResourceInMaintenance && slot.status === 'MAINTENANCE'}
              onSelect={() => onSelectSlot(slot.startsAt)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SlotButtonProps {
  slot: AvailabilitySlot;
  selected: boolean;
  hideStatusLabel: boolean;
  onSelect: () => void;
}

function SlotButton({ slot, selected, hideStatusLabel, onSelect }: SlotButtonProps) {
  const timeRange = formatTimeRangeInLima(slot.startsAt, slot.endsAt);
  const statusLabel = AVAILABILITY_SLOT_STATUS_LABEL[slot.status];

  return (
    <button
      type="button"
      disabled={!slot.available}
      aria-pressed={selected}
      aria-label={
        slot.available
          ? `Franja ${timeRange}, disponible`
          : `Franja ${timeRange}, ${statusLabel.toLowerCase()}`
      }
      onClick={onSelect}
      className={[
        'flex w-full flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        !slot.available
          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
          : selected
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-positive-200 bg-positive-50 text-positive-800 hover:border-positive-400',
      ].join(' ')}
    >
      <span>{timeRange}</span>
      {!slot.available && !hideStatusLabel ? (
        <Badge variant={AVAILABILITY_SLOT_STATUS_BADGE_VARIANT[slot.status]}>{statusLabel}</Badge>
      ) : null}
    </button>
  );
}
