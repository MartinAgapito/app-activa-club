// Destinos de las cifras del resumen operativo (US-059).

import type { MemberStatus } from '@activa-club/shared-types';
import { MEMBERS_TABS } from '../members/members-tabs';

/** Pantallas de destino de cada cifra. */
export const SUMMARY_LINKS = {
  membersByStatus: (status: MemberStatus): string => {
    const tab = MEMBERS_TABS.find((t) => t.status === status);
    return tab ? `/admin/socios?tab=${tab.value}` : '/admin/socios';
  },
  // Filtro "Por vencer" de la lista de socios (US-052).
  expiringSoon: '/admin/socios?tab=activos&membresia=EXPIRING_SOON',
  paymentsFailed: '/admin/membresias?estado=FAILED',
  paymentsSucceeded: '/admin/membresias?estado=SUCCEEDED',
  notifications: '/admin/notificaciones?tab=enviadas',
  analytics: '/admin/analytics',
} as const;
