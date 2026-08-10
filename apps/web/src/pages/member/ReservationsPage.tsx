// Reservas — catálogo de instalaciones y selector de franjas horarias.
//
// Ola 1 del Sprint 3 (EP-04): construye el catálogo (US-028) y el selector
// de disponibilidad por día (US-029) contra la forma exacta del contrato
// (docs/api/contratos-api.md §6), con datos simulados
// (../../resources/resources-client.ts) porque US-027/US-028/US-029 corren
// en paralelo del lado de Backend/DevOps y el endpoint real todavía no está
// desplegado. Es preparación de US-032 (flujo completo de reserva: elegir
// instalación + día + horario + participantes y confirmar), que todavía no
// se implementa acá — no hay selección de participantes ni `POST
// /reservations`, y tampoco el bloqueo por deuda (`canReserve` de `GET
// /dashboard/member`, EP-07, fuera de este sprint).
//
// Reconciliación pendiente cuando el backend esté listo: cambiar
// `resources-client.ts` para llamar a `apiRequest` en vez de a los mocks de
// `resources/catalog-mock-data.ts` y `resources/availability-mock.ts`
// (ver comentarios en ese módulo). Ningún componente de este archivo debería
// cambiar de forma: ya consume el tipo `Resource`/`AvailabilityResponse` del
// contrato tal cual.

import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
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
} from '@activa-club/ui';
import type { AvailabilityResponse, AvailabilitySlot, Resource } from '@activa-club/shared-types';
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
import { useResourceAvailabilityQuery, useResourcesQuery } from '../../resources/resources-query';

export function ReservationsPage() {
  const resourcesQuery = useResourcesQuery();
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayInLima());
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);

  const selectedResource =
    resourcesQuery.data?.find((resource) => resource.resourceId === selectedResourceId) ?? null;

  const availabilityQuery = useResourceAvailabilityQuery(
    selectedResource ? selectedResource.resourceId : null,
    selectedResource ? selectedDate : null,
  );

  function selectResource(resourceId: string) {
    setSelectedResourceId(resourceId);
    setSelectedSlotStart(null);
  }

  function changeDate(nextDate: string) {
    setSelectedDate(nextDate);
    setSelectedSlotStart(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas"
        description="Elige una instalación y un día para ver sus franjas horarias disponibles."
        actions={<Badge variant="warning">Vista previa — datos simulados</Badge>}
      />

      <Card compact className="border-brand-200 bg-brand-50">
        <p className="text-sm text-brand-900">
          Estamos preparando la reserva completa (elegir horario, agregar participantes y
          confirmar). Por ahora esta pantalla muestra el catálogo de instalaciones y su
          disponibilidad con datos de ejemplo, mientras el backend de reservas (US-027..US-029)
          termina de desplegarse.
        </p>
      </Card>

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
          selectedSlotStart={selectedSlotStart}
          onSelectSlot={setSelectedSlotStart}
        />
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
