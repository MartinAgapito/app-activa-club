// Mock de referencia para el patrón TanStack Query (US-008).
//
// Respeta exactamente la forma de `MembershipPlansResponse`
// (@activa-club/shared-types) y del contrato `GET /memberships/plans`
// (docs/api/contratos-api.md §5), pero NO llama a `apiRequest`/fetch: es una
// demostración aislada del patrón de carga/error/éxito para Sprint 1, no una
// pantalla de negocio real (ver criterio de aceptación 7 de US-008).

import type { MembershipPlansResponse } from '@activa-club/shared-types';

const MOCK_PLANS: MembershipPlansResponse = {
  plans: [
    { type: 'MONTHLY', amount: 12000, currency: 'PEN', label: 'Mensual' },
    { type: 'ANNUAL', amount: 120000, currency: 'PEN', label: 'Anual', allowsInstallments: true },
  ],
};

export async function fetchReferenceMembershipPlans(): Promise<MembershipPlansResponse> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return MOCK_PLANS;
}
