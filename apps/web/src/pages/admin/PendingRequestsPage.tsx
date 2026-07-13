import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function PendingRequestsPage() {
  return (
    <UnderConstructionPage
      title="Solicitudes pendientes"
      description="Aprobación o rechazo de socios nuevos en estado pendiente (RN-ACT-06, RN-ADM-02)."
      endpoints={[
        'GET /members?status=PENDING',
        'POST /members/{memberId}/approve',
        'POST /members/{memberId}/reject',
      ]}
    />
  );
}
