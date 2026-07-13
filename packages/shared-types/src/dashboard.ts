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

export interface OccupancyEntry {
  resourceId: string;
  occupancyRate: number;
}

/** Métricas administrativas del MVP (RN-ANL-01..08). */
export interface AdminDashboard {
  membersByStatus: Partial<Record<MemberStatus, number>>;
  membershipsExpiringSoon: number;
  reservationsByResource: Record<string, number>;
  reservationsByDay: ReservationsByDayEntry[];
  pendingApprovals: number;
  payments: { succeeded: number; failed: number };
  occupancy: OccupancyEntry[];
  notificationsSent: number;
}
