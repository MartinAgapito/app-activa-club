// Traducciones de recursos y franjas de disponibilidad (US-028, US-029).
//
// El backend expone los códigos crudos del dominio (`ResourceType`,
// `ResourceStatus`, `AvailabilitySlotStatus`, ver @activa-club/shared-types y
// docs/api/contratos-api.md §6). Ninguna pantalla debe mostrar esos códigos
// directamente: este módulo centraliza la traducción a texto claro y a la
// variante visual (`Badge`) correspondiente, igual que
// `lib/format/member-status.ts`.

import type {
  AvailabilitySlotStatus,
  ResourceStatus,
  ResourceType,
} from '@activa-club/shared-types';
import type { BadgeVariant } from '@activa-club/ui';

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  FUTBOL: 'Fútbol',
  TENIS: 'Tenis',
  PADEL: 'Pádel',
  PISCINA: 'Piscina',
  PARRILLA: 'Parrillas',
  SALON_SOCIAL: 'Salón social',
};

export const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = {
  AVAILABLE: 'Disponible',
  MAINTENANCE: 'En mantenimiento',
};

export const RESOURCE_STATUS_BADGE_VARIANT: Record<ResourceStatus, BadgeVariant> = {
  AVAILABLE: 'positive',
  MAINTENANCE: 'danger',
};

/** Motivo de una franja no reservable, en un texto que el socio entiende
 * (US-029, criterio 11: "distinguiendo visualmente al menos tres
 * situaciones — libre, ocupada por otra reserva y en mantenimiento"). */
export const AVAILABILITY_SLOT_STATUS_LABEL: Record<AvailabilitySlotStatus, string> = {
  AVAILABLE: 'Libre',
  RESERVED: 'Ocupada',
  MAINTENANCE: 'En mantenimiento',
  PAST: 'Ya pasó',
};

export const AVAILABILITY_SLOT_STATUS_BADGE_VARIANT: Record<AvailabilitySlotStatus, BadgeVariant> =
  {
    AVAILABLE: 'positive',
    RESERVED: 'warning',
    MAINTENANCE: 'danger',
    PAST: 'neutral',
  };

/** Duración de bloque en un texto legible ("90 min", "5 h"). */
export function formatBlockDuration(blockMinutes: number): string {
  if (blockMinutes % 60 === 0) {
    const hours = blockMinutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${blockMinutes} min`;
}
