// Pestañas del padrón de socios (US-051): una por estado de cuenta que
// admite `GET /members?status=`. El valor de la pestaña es el que viaja en
// `?tab=`.

import type { MemberOrigin, MemberStatus } from '@activa-club/shared-types';

export interface MembersTab {
  value: string;
  label: string;
  status: MemberStatus;
  emptyTitle: string;
  emptyDescription: string;
}

export const MEMBERS_TABS: ReadonlyArray<MembersTab> = [
  {
    value: 'activos',
    label: 'Activos',
    status: 'ACTIVE',
    emptyTitle: 'No hay socios activos',
    emptyDescription: 'Todavía no hay socios con la cuenta activa.',
  },
  {
    value: 'migrados',
    label: 'Migrados',
    status: 'MIGRATED',
    emptyTitle: 'No hay socios migrados sin activar',
    emptyDescription: 'Todos los socios migrados ya activaron su cuenta.',
  },
  {
    value: 'aprobados',
    label: 'Aprobados',
    status: 'APPROVED',
    emptyTitle: 'No hay socios aprobados pendientes de primer pago',
    emptyDescription: 'No hay socios aprobados que aún no hayan pagado su primera membresía.',
  },
  {
    value: 'pendientes',
    label: 'Pendientes',
    status: 'PENDING',
    emptyTitle: 'No hay solicitudes pendientes',
    emptyDescription: 'No hay socios nuevos esperando aprobación.',
  },
  {
    value: 'rechazados',
    label: 'Rechazados',
    status: 'REJECTED',
    emptyTitle: 'No hay solicitudes rechazadas',
    emptyDescription: 'No hay socios con la solicitud rechazada.',
  },
];

export const DEFAULT_MEMBERS_TAB = MEMBERS_TABS[0] as MembersTab;

export const MEMBER_ORIGIN_LABELS: Record<MemberOrigin, string> = {
  MIGRATED: 'Migrado',
  NEW: 'Nuevo',
};
