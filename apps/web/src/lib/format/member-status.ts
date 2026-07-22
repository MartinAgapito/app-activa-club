// Mapeo de los estados internos de socio y membresía a texto en español,
// pensado para pantallas orientadas al socio (US-018 y siguientes).
//
// El backend expone los códigos crudos del dominio (`MemberStatus`,
// `MembershipStatus`, ver @activa-club/shared-types y
// docs/api/contratos-api.md §4) tal cual están en DynamoDB. Ninguna pantalla
// de socio debe mostrar esos códigos directamente (p. ej. "MIGRATED",
// "DEBT"): este módulo centraliza la traducción a un texto claro y a la
// variante visual (`Badge`) que le corresponde, para no duplicarla en cada
// pantalla que consuma `GET /members/me` o `GET /dashboard/member`.

import type { MemberStatus, MembershipStatus } from '@activa-club/shared-types';
import type { BadgeVariant } from '@activa-club/ui';

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  MIGRATED: 'Migrado — pendiente de activar cuenta',
  PENDING: 'Solicitud pendiente de aprobación',
  APPROVED: 'Aprobado — pendiente de primer pago',
  REJECTED: 'Solicitud rechazada',
  ACTIVE: 'Activo',
};

export const MEMBER_STATUS_BADGE_VARIANT: Record<MemberStatus, BadgeVariant> = {
  MIGRATED: 'neutral',
  PENDING: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  ACTIVE: 'positive',
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  ACTIVE: 'Al día',
  EXPIRING_SOON: 'Por vencer',
  EXPIRED: 'Vencida',
  DEBT: 'Con deuda pendiente',
  NONE: 'Sin membresía activa',
};

export const MEMBERSHIP_STATUS_BADGE_VARIANT: Record<MembershipStatus, BadgeVariant> = {
  ACTIVE: 'positive',
  EXPIRING_SOON: 'warning',
  EXPIRED: 'danger',
  DEBT: 'danger',
  NONE: 'neutral',
};
