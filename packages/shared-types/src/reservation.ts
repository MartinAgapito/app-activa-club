// Entidades y DTOs de recursos y reservas (RN-RES).
// Alineado con docs/data/diccionario-de-datos.md y docs/api/contratos-api.md §6-7.

import type { ISODateString } from './common';

export type ResourceType = 'FUTBOL' | 'TENIS' | 'PADEL' | 'PISCINA' | 'PARRILLA' | 'SALON_SOCIAL';

export type ResourceStatus = 'AVAILABLE' | 'MAINTENANCE';

export type ReservationStatus =
  'CONFIRMED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type ParticipantType = 'HOLDER' | 'MEMBER' | 'GUEST';

/** Recurso reservable (entidad Resource). */
export interface Resource {
  resourceId: string;
  type: ResourceType;
  name: string;
  capacity: number;
  blockMinutes: number;
  /** Horario operativo en hora local del club, formato "HH:mm". */
  opensAt: string;
  closesAt: string;
  requiresApproval: boolean;
  resourceStatus: ResourceStatus;
}

/** Participante de una reserva (entidad ReservationParticipant). */
export interface ReservationParticipant {
  participantId: string;
  reservationId: string;
  participantType: ParticipantType;
  memberId: string | null;
  guestDni: string | null;
  guestName: string | null;
  startsAt: ISODateString;
  endsAt: ISODateString;
}

/** Reserva (cabecera, entidad Reservation). */
export interface Reservation {
  reservationId: string;
  resourceId: string;
  resourceType: ResourceType;
  holderMemberId: string;
  startsAt: ISODateString;
  endsAt: ISODateString;
  reservationStatus: ReservationStatus;
  participantCount: number;
  guestCount: number;
  requiresApproval: boolean;
  rejectionReason: string | null;
  cancelledAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Motivo por el que una franja no es reservable (calculado, no persistido).
 * Permite al socio distinguir una franja tomada por otra reserva de una franja
 * fuera de servicio por mantenimiento (RN-RES-11, contrato §6).
 *
 * Precedencia cuando aplica más de un motivo: `PAST` → `MAINTENANCE` →
 * `RESERVED`.
 */
export type AvailabilitySlotStatus = 'AVAILABLE' | 'RESERVED' | 'MAINTENANCE' | 'PAST';

/** Franja de disponibilidad calculada para un recurso. */
export interface AvailabilitySlot {
  startsAt: ISODateString;
  endsAt: ISODateString;
  /** Campo de decisión del cliente. Equivale a `status === 'AVAILABLE'`. */
  available: boolean;
  status: AvailabilitySlotStatus;
}

export interface AvailabilityResponse {
  resourceId: string;
  date: string;
  blockMinutes: number;
  /**
   * Estado del recurso completo: `MAINTENANCE` significa bloqueo indefinido
   * (todas las franjas del día llegan con `status='MAINTENANCE'`), frente a una
   * ventana acotada de mantenimiento que solo afecta a algunas franjas.
   */
  resourceStatus: ResourceStatus;
  slots: AvailabilitySlot[];
}

// --- Creación de reserva ---

/**
 * Participante enviado al crear una reserva (el titular nunca viaja aquí: es el
 * socio autenticado).
 *
 * - `MEMBER`: requiere `memberId`, obtenido con `GET /members/lookup?dni=`.
 * - `GUEST`: requiere `dni`, `firstName` y `lastName`. Si el DNI ya tiene
 *   `GuestProfile` (`GET /guests/lookup?dni=`), el servidor conserva el nombre
 *   registrado y descarta el enviado (gana el primer registro, ADR-0009).
 */
export interface ReservationParticipantInput {
  type: Exclude<ParticipantType, 'HOLDER'>;
  memberId?: string;
  dni?: string;
  firstName?: string;
  lastName?: string;
}

export interface CreateReservationRequest {
  resourceId: string;
  startsAt: ISODateString;
  participants: ReservationParticipantInput[];
  notes?: string;
}

export interface CreateReservationResponse {
  reservationId: string;
  resourceId: string;
  reservationStatus: ReservationStatus;
  startsAt: ISODateString;
  endsAt: ISODateString;
  participantCount: number;
  guestCount: number;
}

export interface CancelReservationResponse {
  reservationId: string;
  reservationStatus: ReservationStatus;
}

export interface RejectReservationRequest {
  reason: string;
}

// --- Administración de recursos ---

export interface UpdateResourceRequest {
  capacity?: number;
  opensAt?: string;
  closesAt?: string;
  resourceStatus?: ResourceStatus;
}

export interface CreateMaintenanceRequest {
  startsAt: ISODateString;
  endsAt: ISODateString;
  reason?: string;
}

/** Bloqueo por mantenimiento (entidad MaintenanceBlock). */
export interface MaintenanceBlock {
  blockId: string;
  resourceId: string;
  startsAt: ISODateString;
  endsAt: ISODateString;
  reason: string | null;
  createdBy: string;
  createdAt: ISODateString;
}

/**
 * Respuesta de `POST /resources/{resourceId}/maintenance`. El bloqueo impide
 * reservas nuevas pero **no** cancela las existentes (US-035): por eso informa
 * cuántas reservas activas quedan dentro de la ventana, para que el
 * administrador decida si las cancela.
 */
export interface CreateMaintenanceResponse {
  blockId: string;
  resourceId: string;
  startsAt: ISODateString;
  endsAt: ISODateString;
  reason: string | null;
  affectedReservationCount: number;
}

// --- Invitados externos (RN-RES-03/04) ---

/**
 * Perfil persistente de un invitado externo (entidad GuestProfile, modelo
 * §3.15). Se crea de forma implícita e idempotente al confirmar la primera
 * reserva en la que participa; no hay endpoint de alta ni de edición.
 */
export interface GuestProfile {
  guestDni: string;
  firstName: string;
  lastName: string;
  createdByMemberId: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Resolución de un invitado externo por DNI exacto
 * (`GET /guests/lookup?dni=`). Solo nombre y apellido: nunca su contador
 * mensual de visitas, que revelaría su actividad con otros socios.
 */
export interface GuestLookupResponse {
  guestDni: string;
  firstName: string;
  lastName: string;
}
