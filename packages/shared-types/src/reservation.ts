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

/** Franja de disponibilidad calculada para un recurso. */
export interface AvailabilitySlot {
  startsAt: ISODateString;
  endsAt: ISODateString;
  available: boolean;
}

export interface AvailabilityResponse {
  resourceId: string;
  date: string;
  blockMinutes: number;
  slots: AvailabilitySlot[];
}

// --- Creación de reserva ---

export interface ReservationParticipantInput {
  type: Exclude<ParticipantType, 'HOLDER'>;
  memberId?: string;
  dni?: string;
  name?: string;
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
