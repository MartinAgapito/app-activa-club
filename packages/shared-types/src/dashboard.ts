// DTOs de dashboards del socio y del administrador (RN-ANL, dashboard del socio).
// Alineado con docs/api/contratos-api.md §9.

import type { ISODateString } from './common';
import type { MemberStatus, MembershipStatus, MembershipType } from './member';
import type { ReservationStatus, ResourceType } from './reservation';
import type { NotificationReadStatus } from './notification';

export interface MemberDashboardAlert {
  code: string;
  message: string;
}

export interface MemberDashboardMembership {
  type: MembershipType | null;
  status: MembershipStatus;
  endsAt: ISODateString | null;
  daysRemaining: number | null;
  outstandingBalance: number;
}

export interface MemberDashboardReservation {
  reservationId: string;
  resourceType: ResourceType;
  startsAt: ISODateString;
  reservationStatus: ReservationStatus;
}

export interface MemberDashboardNotification {
  notificationId: string;
  title: string;
  readStatus: NotificationReadStatus;
}

/** Home personal del socio. */
export interface MemberDashboard {
  member: { firstName: string; memberStatus: MemberStatus };
  membership: MemberDashboardMembership;
  canReserve: boolean;
  alerts: MemberDashboardAlert[];
  upcomingReservations: MemberDashboardReservation[];
  recentNotifications: MemberDashboardNotification[];
}

export interface ReservationsByDayEntry {
  date: string;
  count: number;
}

/** Reservas por hora de inicio (`HH:00`, hora de Lima) del período (adenda 2026-10-12, US-058). */
export interface ReservationsByHourEntry {
  hour: string;
  count: number;
}

/** Ventana semiabierta `[from, to)` expresada en UTC (adenda 2026-10-12, US-058). */
export interface DashboardPeriod {
  from: ISODateString;
  to: ISODateString;
  timeZone: 'America/Lima';
}

export interface DashboardPeriods {
  currentMonth: DashboardPeriod;
  last30Days: DashboardPeriod;
}

export interface OccupancyEntry {
  resourceId: string;
  /** `reservedHours / operatingHours`, acotado a [0, 1], 4 decimales. */
  occupancyRate: number;
  /** Horas reservadas (hasta 2 decimales), sin la parte solapada con mantenimiento. */
  reservedHours: number;
  /** Horas operativas del período (hasta 2 decimales), sin las cubiertas por mantenimiento. */
  operatingHours: number;
}

/** Métricas administrativas del MVP (RN-ANL-01..08). */
export interface AdminDashboard {
  periods: DashboardPeriods;
  membersByStatus: Partial<Record<MemberStatus, number>>;
  membershipsExpiringSoon: number;
  reservationsByResource: Record<string, number>;
  reservationsByDay: ReservationsByDayEntry[];
  reservationsByHour: ReservationsByHourEntry[];
  pendingApprovals: number;
  payments: { succeeded: number; failed: number };
  occupancy: OccupancyEntry[];
  notificationsSent: number;
}
