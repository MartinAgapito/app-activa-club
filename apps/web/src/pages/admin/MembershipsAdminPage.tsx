import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function MembershipsAdminPage() {
  return (
    <UnderConstructionPage
      title="Membresías y pagos"
      description="Consulta de planes de membresía y del historial de pagos de todos los socios (RN-ADM-07)."
      endpoints={['GET /memberships/plans', 'GET /payments', 'GET /payments/{paymentId}']}
    />
  );
}
