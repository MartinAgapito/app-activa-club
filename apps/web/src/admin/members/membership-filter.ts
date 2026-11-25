// Filtro por situación de membresía del padrón de socios (US-052).
//
// El valor viaja en `?membresia=` y es el mismo `membershipStatus` que acepta
// `GET /members` (siempre junto con `status`). "Todas" no envía el parámetro.

import type { MembershipStatus } from '@activa-club/shared-types';
import { MEMBERSHIP_STATUS_LABELS } from '../../lib/format/member-status';

export const MEMBERSHIP_FILTER_PARAM = 'membresia';

/** Orden de las opciones: primero las de seguimiento de cobranza. */
export const MEMBERSHIP_FILTER_VALUES = [
  'DEBT',
  'EXPIRED',
  'EXPIRING_SOON',
  'ACTIVE',
  'NONE',
] as const satisfies ReadonlyArray<MembershipStatus>;

export type MembershipFilter = (typeof MEMBERSHIP_FILTER_VALUES)[number];

export const MEMBERSHIP_FILTER_LABELS: Record<MembershipFilter, string> = {
  DEBT: 'Con deuda',
  EXPIRED: 'Vencidos',
  EXPIRING_SOON: 'Por vencer',
  ACTIVE: MEMBERSHIP_STATUS_LABELS.ACTIVE,
  NONE: 'Sin membresía',
};

/** Lee el filtro de la URL; un valor desconocido equivale a "Todas". */
export function parseMembershipFilter(value: string | null): MembershipFilter | undefined {
  return MEMBERSHIP_FILTER_VALUES.find((candidate) => candidate === value);
}
