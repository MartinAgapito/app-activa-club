// Cliente de los planes de membresía disponibles — US-020.
//
// `GET /memberships/plans` (docs/api/contratos-api.md §5) es de solo lectura
// y accesible tanto para `member` como para `admin` (un admin puede
// consultarlos con fines de verificación, sin acción de pago — caso
// alternativo de US-020). Los montos vienen siempre en céntimos y son
// parametrizables por el backend: el frontend nunca los escribe ni los
// inventa (criterio de aceptación 3). Reutiliza `apiRequest`
// (lib/api/http-client.ts), que ya normaliza los errores al formato estándar
// del contrato.

import type { MembershipPlan, MembershipPlansResponse } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Planes de membresía disponibles (al menos `MONTHLY` y `ANNUAL`, criterio de
 * aceptación 1). Se usa tanto en la consulta de planes (US-020) como en el
 * checkout (US-022), que reutiliza este mismo cliente. */
export function fetchMembershipPlans(): Promise<MembershipPlan[]> {
  return apiRequest<MembershipPlansResponse>('/memberships/plans').then(
    (response) => response.plans,
  );
}
