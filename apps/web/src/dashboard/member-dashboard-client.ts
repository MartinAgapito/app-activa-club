// Cliente de `GET /dashboard/member` (docs/api/contratos-api.md §9, US-055).
// Una sola respuesta alimenta el inicio del socio: membresía, `canReserve`,
// alertas, próximas reservas y avisos recientes.

import type { MemberDashboard } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

export function fetchMemberDashboard(): Promise<MemberDashboard> {
  return apiRequest<MemberDashboard>('/dashboard/member');
}
