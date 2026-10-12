// Selector de día y grilla de franjas horarias (US-029; paso 2 del asistente
// de US-072). El protagonismo visual está en la grilla: la hora en
// Barlow Semi Condensed con cifras tabulares y un estado por franja (libre,
// ocupada, en mantenimiento, ya pasó, elegida) que nunca depende solo del
// color: cada estado lleva su texto visible.

import type { UseQueryResult } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, Input, Spinner, cn } from '@activa-club/ui';
import type { AvailabilityResponse, AvailabilitySlot } from '@activa-club/shared-types';
import { ApiRequestError } from '../lib/api/http-client';
import { addDaysToDate, formatTimeRangeInLima } from '../lib/format/lima-time';
import { AVAILABILITY_SLOT_STATUS_LABEL } from '../lib/format/resource';

/** Días que ofrece la fila desplazable (hoy + 13). */
const DAY_STRIP_LENGTH = 14;

const WEEKDAY = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
const FULL = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

interface DayPickerProps {
  today: string;
  value: string;
  onChange: (date: string) => void;
}

export function DayPicker({ today, value, onChange }: DayPickerProps) {
  const days = Array.from({ length: DAY_STRIP_LENGTH }, (_, index) => addDaysToDate(today, index));

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Elige un día"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
      >
        {days.map((day, index) => {
          const instant = new Date(`${day}T00:00:00Z`);
          const selected = day === value;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected}
              aria-label={index === 0 ? `Hoy, ${FULL.format(instant)}` : FULL.format(instant)}
              onClick={() => onChange(day)}
              className={cn(
                'focus-ring flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center rounded-control border px-2 py-1 transition-colors',
                selected
                  ? 'border-action bg-action text-ink-on-brand'
                  : 'border-line-strong bg-surface-card text-ink hover:bg-surface-brand-soft',
              )}
            >
              <span className="type-aux capitalize">
                {index === 0 ? 'Hoy' : WEEKDAY.format(instant)}
              </span>
              <span className="font-display text-xl font-semibold tabular-nums leading-tight">
                {Number(day.slice(8, 10))}
              </span>
              <span className="type-aux">{MONTH.format(instant)}</span>
            </button>
          );
        })}
      </div>
      <div className="max-w-xs">
        <Input
          type="date"
          label="Otra fecha"
          id="reservations-date"
          min={today}
          value={value}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
        />
      </div>
    </div>
  );
}

interface SlotGridProps {
  query: UseQueryResult<AvailabilityResponse>;
  selectedSlotStart: string | null;
  onSelectSlot: (slot: AvailabilitySlot) => void;
}

export function SlotGrid({ query, selectedSlotStart, onSelectSlot }: SlotGridProps) {
  const hasAvailableSlot = query.data?.slots.some((slot) => slot.available) ?? false;

  return (
    <div className="flex flex-col gap-3">
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
        <SlotList
          response={query.data}
          selectedSlotStart={selectedSlotStart}
          onSelectSlot={onSelectSlot}
        />
      ) : null}

      {query.data && !hasAvailableSlot && query.data.resourceStatus === 'AVAILABLE' ? (
        <p className="text-sm text-ink-muted">
          No hay franjas libres para este día. Prueba con otra fecha.
        </p>
      ) : null}
    </div>
  );
}

interface SlotListProps {
  response: AvailabilityResponse;
  selectedSlotStart: string | null;
  onSelectSlot: (slot: AvailabilitySlot) => void;
}

function SlotList({ response, selectedSlotStart, onSelectSlot }: SlotListProps) {
  if (response.slots.length === 0) {
    return (
      <EmptyState
        title="Sin franjas disponibles"
        description="Esta instalación no tiene franjas configuradas para este horario."
      />
    );
  }

  // US-029, criterio 11: con mantenimiento indefinido se avisa una sola vez a
  // nivel de instalación en vez de repetir el mismo mensaje franja por franja.
  const isWholeResourceInMaintenance = response.resourceStatus === 'MAINTENANCE';

  return (
    <div className="flex flex-col gap-3">
      {isWholeResourceInMaintenance ? (
        <p
          role="status"
          className="rounded-control border border-status-problem bg-status-problem-soft px-3 py-2 text-sm text-status-problem"
        >
          Esta instalación está en mantenimiento y no admite reservas por el momento.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {response.slots.map((slot) => (
          <li key={slot.startsAt}>
            <SlotButton
              slot={slot}
              selected={slot.startsAt === selectedSlotStart}
              wholeResourceInMaintenance={isWholeResourceInMaintenance}
              onSelect={() => onSelectSlot(slot)}
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
  wholeResourceInMaintenance: boolean;
  onSelect: () => void;
}

function SlotButton({ slot, selected, wholeResourceInMaintenance, onSelect }: SlotButtonProps) {
  const timeRange = formatTimeRangeInLima(slot.startsAt, slot.endsAt);
  const statusLabel = AVAILABILITY_SLOT_STATUS_LABEL[slot.status];
  const visibleLabel = selected
    ? 'Elegida'
    : slot.available
      ? 'Libre'
      : wholeResourceInMaintenance && slot.status === 'MAINTENANCE'
        ? 'No disponible'
        : statusLabel;

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
      className={cn(
        'focus-ring flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-control border px-2 py-2 transition-colors',
        !slot.available
          ? 'cursor-not-allowed border-line bg-surface-raised text-ink-disabled'
          : selected
            ? 'border-action bg-action text-ink-on-brand'
            : 'border-status-confirmed bg-status-confirmed-soft text-ink hover:bg-white',
      )}
    >
      <span aria-hidden="true" className="font-display text-lg font-semibold tabular-nums">
        {timeRange}
      </span>
      <span aria-hidden="true" className="type-aux">
        {selected ? '✓ ' : ''}
        {visibleLabel}
      </span>
    </button>
  );
}
