// Traducciones asociadas al tipo de plan de membresía (US-020).
//
// `GET /memberships/plans` (docs/api/contratos-api.md §5) no incluye la
// duración de la vigencia que otorga cada plan: es implícita por `type`
// (RN-PAG-01, el dominio solo contempla mensual y anual). Este módulo
// centraliza esa traducción para no repetirla en cada pantalla que consuma
// un `MembershipType` (consulta de planes, checkout de US-022, perfil).

import type { MembershipType } from '@activa-club/shared-types';

export const MEMBERSHIP_TYPE_DURATION_LABEL: Record<MembershipType, string> = {
  MONTHLY: '1 mes de vigencia',
  ANNUAL: '1 año de vigencia',
};

export const MEMBERSHIP_TYPE_LABEL: Record<MembershipType, string> = {
  MONTHLY: 'Mensual',
  ANNUAL: 'Anual',
};
