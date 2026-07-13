import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function PaymentsPage() {
  return (
    <UnderConstructionPage
      title="Pagos"
      description="Historial de pagos y pago/renovación de membresía con tarjeta vía Culqi sandbox (RN-PAG-04/07/08)."
      endpoints={['GET /memberships/plans', 'POST /payments', 'GET /payments']}
    />
  );
}
